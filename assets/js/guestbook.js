/* 留言板：Netlify Forms 提交 + Function 拉列表 */
(function () {
  'use strict';

  const listEl = document.querySelector('[data-guestbook-list]');
  const emptyEl = document.querySelector('[data-guestbook-empty]');
  const form = document.querySelector('[data-guestbook-form]');
  const statusEl = document.querySelector('[data-guestbook-status]');
  if (!listEl || !form) return;

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  function fmtWhen(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function render(items) {
    if (!items.length) {
      listEl.innerHTML = '';
      listEl.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    listEl.hidden = false;
    listEl.innerHTML = items.map((it) => `
      <article class="gb__item">
        <header class="gb__meta">
          <span class="gb__name">${esc(it.name || '匿名')}</span>
          <time class="gb__when" datetime="${esc(it.created)}">${esc(fmtWhen(it.created))}</time>
        </header>
        <p class="gb__text">${esc(it.message).replace(/\n/g, '<br>')}</p>
      </article>`).join('');
  }

  async function loadList() {
    try {
      const res = await fetch('/.netlify/functions/guestbook-list?t=' + Date.now(), {
        cache: 'no-store'
      });
      const data = await res.json();
      render(Array.isArray(data.items) ? data.items : []);
      if (data.error === 'missing_config' && statusEl) {
        statusEl.textContent = '留言墙待配置：请在 Netlify 环境变量里加上 NETLIFY_AUTH_TOKEN。';
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = '暂时读不到留言，稍后再试。';
    }
  }

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.dataset.kind = kind || '';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    const fd = new FormData(form);
    // Netlify Forms 需要 urlencoded
    const body = new URLSearchParams();
    fd.forEach((v, k) => body.append(k, v));

    if (btn) {
      btn.disabled = true;
      btn.textContent = '送出中…';
    }
    setStatus('正在送出…');

    try {
      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });
      if (!res.ok) throw new Error('http_' + res.status);
      form.reset();
      setStatus('已送出。', 'ok');
      // Forms 入库略有延迟
      setTimeout(loadList, 1200);
      setTimeout(loadList, 3500);
    } catch (err) {
      setStatus('送出失败，请稍后重试。', 'err');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '写下留言';
      }
    }
  });

  loadList();
})();

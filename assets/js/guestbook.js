/* 留言板：提交到 Netlify Function，Blobs 存储，即时上墙 */
(function () {
  'use strict';

  const listEl = document.querySelector('[data-guestbook-list]');
  const emptyEl = document.querySelector('[data-guestbook-empty]');
  const form = document.querySelector('[data-guestbook-form]');
  const statusEl = document.querySelector('[data-guestbook-status]');
  if (!listEl || !form) return;

  const API = '/.netlify/functions/guestbook';

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
      const res = await fetch(API + '?t=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      render(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      if (statusEl) {
        statusEl.textContent = '暂时读不到留言，稍后再试。';
        statusEl.dataset.kind = 'err';
      }
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
    const payload = {
      name: String(fd.get('name') || '').trim(),
      message: String(fd.get('message') || '').trim(),
      'bot-field': String(fd.get('bot-field') || '')
    };

    if (btn) {
      btn.disabled = true;
      btn.textContent = '送出中…';
    }
    setStatus('正在送出…');

    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.hint || data.error || ('http_' + res.status));
      }
      form.reset();
      setStatus('已送出。', 'ok');
      if (Array.isArray(data.items)) render(data.items);
      else loadList();
    } catch (err) {
      setStatus(err.message || '送出失败，请稍后重试。', 'err');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '写下留言';
      }
    }
  });

  loadList();
})();

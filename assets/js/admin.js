/* ==========================================================================
   Kris — 编辑模式
   只有拿着 GitHub 令牌的人能解锁；令牌只存在本机 localStorage，不进仓库。
   内容写到 content/site.json，代码更新不会碰这个文件。
   ========================================================================== */

(function () {
  'use strict';

  const REPO = 'wyf-yfw/blog';
  const BRANCH = 'main';
  const DATA_PATH = 'content/site.json';
  const TOKEN_KEY = 'kris.gh.token';
  const API = 'https://api.github.com';

  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  const today = () => new Date().toLocaleDateString('sv-SE');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const data = () => window.KRIS_DATA || (window.KRIS_DATA = { about: { paragraphs: [] }, articles: [], notes: [], photos: [] });

  /* ---------- GitHub ---------- */
  async function gh(path, opts) {
    const res = await fetch(API + path, {
      ...opts,
      headers: {
        Authorization: 'Bearer ' + token(),
        Accept: 'application/vnd.github+json',
        ...(opts && opts.headers)
      }
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch (e) { /* ignore */ }
      const err = new Error(detail || res.statusText || ('HTTP ' + res.status));
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  function b64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  async function whoami() {
    return gh('/user');
  }

  async function commitFile(path, content, message, isBase64) {
    const url = `/repos/${REPO}/contents/${path}`;
    let sha;
    try {
      const cur = await gh(url + '?ref=' + BRANCH);
      sha = cur.sha;
    } catch (e) {
      if (e.status !== 404) throw e;
    }

    const body = { message, branch: BRANCH, content: isBase64 ? content : b64(content) };
    if (sha) body.sha = sha;

    return gh(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  async function saveJson(message) {
    const json = JSON.stringify(data(), null, 2) + '\n';
    await commitFile(DATA_PATH, json, message);
  }

  /* ---------- UI ---------- */
  let root, bar, panel, toastTimer;

  function toast(text, kind) {
    let el = document.querySelector('.adm__toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'adm__toast';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.dataset.kind = kind || 'ok';
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 4200);
  }

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'adm';
    root.innerHTML = `
      <div class="adm__bar">
        <span class="adm__tag">编辑模式</span>
        <button type="button" data-act="article">文章</button>
        <button type="button" data-act="note">手记</button>
        <button type="button" data-act="photo">照片</button>
        <button type="button" data-act="about">关于</button>
        <button type="button" data-act="backup">备份</button>
        <button type="button" data-act="exit" class="adm__exit">退出</button>
      </div>
      <div class="adm__panel" hidden></div>`;
    document.body.appendChild(root);
    bar = root.querySelector('.adm__bar');
    panel = root.querySelector('.adm__panel');

    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'exit') return exit();
      if (act === 'backup') return backup();
      open(act);
    });
  }

  function backup() {
    const blob = new Blob([JSON.stringify(data(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kris-site-' + today() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('已下载备份');
  }

  const FIELDS = {
    article: () => `
      <label>标题<input name="title" required maxlength="120"></label>
      <div class="adm__row">
        <label>日期<input name="date" type="date" value="${today()}" required></label>
        <label>阅读分钟<input name="minutes" type="number" min="1" max="99" placeholder="选填"></label>
      </div>
      <label>摘要（列表和首页显示的一句话）<input name="excerpt" maxlength="200"></label>
      <label>标签（逗号分隔）<input name="tags" placeholder="生活，东京"></label>
      <label>正文
        <textarea name="body" rows="12" required placeholder="空一行分段。可用：
## 小标题
> 引用
- 列表项"></textarea>
      </label>`,
    note: () => `
      <label>日期<input name="date" type="date" value="${today()}" required></label>
      <label>内容<textarea name="text" rows="4" required></textarea></label>
      <label>标签（逗号分隔）<input name="tags" placeholder="想法"></label>`,
    photo: () => `
      <label>图片<input name="file" type="file" accept="image/*" required></label>
      <label>说明<input name="caption" maxlength="80"></label>
      <label>日期<input name="date" type="date" value="${today()}"></label>`,
    about: () => `
      <label>自我介绍（空一行分段）
        <textarea name="paragraphs" rows="10"></textarea>
      </label>`
  };

  const TITLES = { article: '写文章', note: '记手记', photo: '传照片', about: '改关于' };

  function open(kind, editing) {
    build();
    panel.hidden = false;
    panel.dataset.kind = kind;
    panel.innerHTML = `
      <div class="adm__head">
        <strong>${TITLES[kind]}</strong>
        <button type="button" class="adm__close" data-close aria-label="关闭">&times;</button>
      </div>
      <form class="adm__form">${FIELDS[kind]()}
        <div class="adm__actions">
          <button type="submit" class="adm__save">保存并发布</button>
          <span class="adm__hint">提交后约 1 分钟生效</span>
        </div>
      </form>
      <div class="adm__list"></div>`;

    panel.querySelector('[data-close]').onclick = () => { panel.hidden = true; };

    const form = panel.querySelector('form');
    if (kind === 'about') {
      form.paragraphs.value = ((data().about || {}).paragraphs || []).join('\n\n');
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit(kind, form);
    });

    listItems(kind);
  }

  function listItems(kind) {
    const box = panel.querySelector('.adm__list');
    if (!box || kind === 'about') return;

    const items = kind === 'article' ? data().articles
      : kind === 'note' ? data().notes
      : data().photos;

    if (!items.length) { box.innerHTML = ''; return; }

    box.innerHTML = '<p class="adm__sub">已有的' + (kind === 'photo' ? '照片' : kind === 'note' ? '手记' : '文章') + '</p>' +
      items.map((it) => `
        <div class="adm__item">
          <span>${(it.title || it.caption || it.text || '').slice(0, 26).replace(/</g, '&lt;')}</span>
          <span class="adm__item-date">${it.date || ''}</span>
          ${kind === 'article' ? `<button type="button" data-edit="${it.id}">编辑</button>` : ''}
          <button type="button" data-del="${it.id}">删除</button>
        </div>`).join('');

    box.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-del]');
      const edit = e.target.closest('[data-edit]');
      if (del) return remove(kind, del.dataset.del);
      if (edit) return editArticle(edit.dataset.edit);
    });
  }

  async function editArticle(id) {
    const art = data().articles.find((a) => a.id === id);
    if (!art) return;
    open('article');
    const form = panel.querySelector('form');
    form.title.value = art.title || '';
    form.date.value = art.date || today();
    form.minutes.value = art.minutes || '';
    form.excerpt.value = art.excerpt || '';
    form.tags.value = (art.tags || []).join('，');
    form.body.value = art.body || '';
    form.dataset.editing = id;
    panel.scrollIntoView({ block: 'end' });
  }

  async function remove(kind, id) {
    const key = kind === 'article' ? 'articles' : kind === 'note' ? 'notes' : 'photos';
    const item = data()[key].find((x) => x.id === id);
    if (!item) return;
    const label = item.title || item.caption || item.text || '';
    if (!confirm('删除「' + label.slice(0, 30) + '」？\n内容会从网站移除，但历史记录里还能找回。')) return;

    data()[key] = data()[key].filter((x) => x.id !== id);
    try {
      await saveJson('删除：' + label.slice(0, 40));
      toast('已删除');
      window.KRIS_RERENDER();
      open(kind);
    } catch (err) {
      toast('失败：' + err.message, 'err');
    }
  }

  const splitTags = (s) => (s || '').split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean);

  async function submit(kind, form) {
    const btn = form.querySelector('.adm__save');
    btn.disabled = true;
    btn.textContent = '保存中…';

    try {
      if (kind === 'article') {
        const id = form.dataset.editing || uid();
        const item = {
          id,
          date: form.date.value || today(),
          title: form.title.value.trim(),
          excerpt: form.excerpt.value.trim(),
          tags: splitTags(form.tags.value),
          minutes: form.minutes.value ? Number(form.minutes.value) : null,
          body: form.body.value
        };
        const list = data().articles;
        const i = list.findIndex((a) => a.id === id);
        if (i >= 0) list[i] = item; else list.push(item);
        await saveJson('文章：' + item.title);
        toast('已保存，约 1 分钟后线上可见');
      }

      if (kind === 'note') {
        const item = {
          id: uid(),
          date: form.date.value || today(),
          text: form.text.value.trim(),
          tags: splitTags(form.tags.value)
        };
        data().notes.push(item);
        await saveJson('手记：' + item.text.slice(0, 30));
        toast('已保存，约 1 分钟后线上可见');
      }

      if (kind === 'photo') {
        const file = form.file.files[0];
        if (!file) throw new Error('先选一张图');

        const id = uid();
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const src = `assets/img/uploads/${id}.${ext}`;
        const dims = await imageSize(file);

        await commitFile(src, await base64Of(file), '图片：' + (form.caption.value || file.name), true);
        data().photos.push({
          id,
          src,
          caption: form.caption.value.trim(),
          date: form.date.value || today(),
          width: dims.w,
          height: dims.h
        });
        await saveJson('照片：' + (form.caption.value || file.name));
        toast('已上传，约 1 分钟后可见');
      }

      if (kind === 'about') {
        const text = form.paragraphs.value.trim();
        data().about = { paragraphs: text ? text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) : [] };
        await saveJson('关于：更新自我介绍');
        toast('已保存，约 1 分钟后生效');
      }

      form.reset();
      delete form.dataset.editing;
      window.KRIS_RERENDER();
      open(kind);
    } catch (err) {
      toast('失败：' + err.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存并发布';
    }
  }

  function base64Of(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1]);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  function imageSize(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve({ w: img.naturalWidth, h: img.naturalHeight });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => resolve({ w: 1200, h: 1200 });
      img.src = url;
    });
  }

  /* ---------- 解锁 ---------- */
  async function unlock(silent) {
    let t = token();
    if (!t) {
      t = prompt('粘贴 GitHub 令牌（只存在这台设备的浏览器里，不会进仓库）：');
      if (!t) return false;
      t = t.trim();
    }
    localStorage.setItem(TOKEN_KEY, t);

    try {
      const me = await whoami();
      build();
      root.hidden = false;
      if (!silent) toast('编辑模式已开启 · ' + me.login);
      document.dispatchEvent(new CustomEvent('kris:admin'));
      return true;
    } catch (err) {
      localStorage.removeItem(TOKEN_KEY);
      if (!silent) alert('令牌无效或没有权限：' + err.message);
      return false;
    }
  }

  function exit() {
    localStorage.removeItem(TOKEN_KEY);
    if (root) root.hidden = true;
    toast('已退出编辑模式');
  }

  /* ---------- 入口 ---------- */
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      if (root && !root.hidden) exit(); else unlock();
    }
  });

  if (/[?&]admin=1/.test(location.search) && token()) {
    document.addEventListener('kris:rendered', () => unlock(true), { once: true });
  }
})();

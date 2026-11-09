/* ==========================================================================
   Kris — 编辑模式
   用密码开门；保存到仓库时才用 GitHub 令牌（只存在本机，退出不清）。
   内容写到 content/site.json，代码更新不会碰这个文件。
   ========================================================================== */

(function () {
  'use strict';

  const REPO = 'wyf-yfw/blog';
  const BRANCH = 'main';
  const DATA_PATH = 'content/site.json';
  const PASS = 'wyf040108';
  const TOKEN_KEY = 'kris.gh.token';
  const API = 'https://api.github.com';

  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  const today = () => new Date().toLocaleDateString('sv-SE');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const nowStamp = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const data = () => window.KRIS_DATA || (window.KRIS_DATA = { about: { paragraphs: [] }, articles: [], notes: [], photos: [], timeline: [] });

  // 保存内容时往时间线最前面插一条；同文案连着点只刷新时间
  function pushTimeline(kind, text) {
    const d = data();
    if (!Array.isArray(d.timeline)) d.timeline = [];
    const head = d.timeline[0];
    const stamp = nowStamp();
    if (head && head.kind === kind && head.text === text) {
      head.date = stamp;
      return;
    }
    d.timeline.unshift({ id: uid(), date: stamp, text: text, kind: kind });
    if (d.timeline.length > 200) d.timeline.length = 200;
  }

  /* ---------- GitHub ---------- */
  // 发布还是走 GitHub API，令牌只在第一次保存时问一次，之后留在本机
  function ensureToken() {
    let t = token();
    if (t) return t;
    t = prompt('第一次发布需要粘贴 GitHub 令牌（之后不用再输，只存在这台设备）：');
    if (!t) throw new Error('取消了，没有令牌就发不上去');
    t = t.trim();
    localStorage.setItem(TOKEN_KEY, t);
    return t;
  }

  async function gh(path, opts) {
    let res;
    try {
      // 只用 fetch 的 cache: 'no-store' 防缓存；不要加 Cache-Control 请求头，
      // 那会触发 CORS 预检，GitHub 不放行时浏览器只会报 Failed to fetch
      res = await fetch(API + path, {
        ...opts,
        cache: 'no-store',
        headers: {
          Authorization: 'Bearer ' + ensureToken(),
          Accept: 'application/vnd.github+json',
          ...(opts && opts.headers)
        }
      });
    } catch (e) {
      throw new Error('连不上 GitHub（网络或跨域）。可关掉广告拦截后再试');
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch (e) { /* ignore */ }
      if (res.status === 401 || res.status === 403) localStorage.removeItem(TOKEN_KEY);
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

  // 记住每个文件上次写成功后的 sha；再写时用它，避免浏览器把旧的 GET 结果缓存回来
  const shaCache = Object.create(null);

  async function currentSha(path) {
    if (shaCache[path]) return shaCache[path];
    try {
      const cur = await gh(`/repos/${REPO}/contents/${path}?ref=${BRANCH}&_=${Date.now()}`);
      return cur.sha;
    } catch (e) {
      if (e.status === 404) return '';
      throw e;
    }
  }

  async function commitFile(path, content, message, isBase64) {
    const url = `/repos/${REPO}/contents/${path}`;
    const body = { message, branch: BRANCH, content: isBase64 ? content : b64(content) };

    const put = async (sha) => {
      if (sha) body.sha = sha;
      else delete body.sha;
      return gh(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    };

    let sha = await currentSha(path);
    let result;
    try {
      result = await put(sha);
    } catch (e) {
      // 对不上就丢掉缓存，重新问一次当前 sha 再写
      if (e.status !== 409 && !(e.message || '').includes('does not match')) throw e;
      delete shaCache[path];
      sha = await currentSha(path);
      result = await put(sha);
    }

    if (result && result.content && result.content.sha) shaCache[path] = result.content.sha;
    return result;
  }

  async function saveJson(message) {
    const json = JSON.stringify(data(), null, 2) + '\n';
    await commitFile(DATA_PATH, json, message);
  }

  /* ---------- UI：就地图标，不要底部弹窗 ---------- */
  let active = false;
  let toastTimer = 0;
  let sheetAnchor = null;

  const ICO = {
    add: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>',
    del: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M5 11h14v2H5z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M6.4 5l5.6 5.6L17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>'
  };

  const TITLES = { article: '写文章', note: '记手记', photo: '传照片', about: '改关于' };

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
- 列表项
也可以点下面「插入图片」"></textarea>
      </label>
      <div class="adm__imgrow">
        <button type="button" class="adm__imgbtn" data-insert-img>插入图片</button>
        <input type="file" accept="image/*" hidden data-img-file>
        <span class="adm__hint">选图后上传并插到光标处，单张建议不超过 5MB</span>
      </div>`,
    note: () => `
      <label>日期<input name="date" type="date" value="${today()}" required></label>
      <label>内容<textarea name="text" rows="5" required placeholder="想到就写。也可以插入图片。"></textarea></label>
      <div class="adm__imgrow">
        <button type="button" class="adm__imgbtn" data-insert-img>插入图片</button>
        <input type="file" accept="image/*" hidden data-img-file>
        <span class="adm__hint">选图后上传并插到光标处</span>
      </div>
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

  function clearChrome() {
    document.querySelectorAll('.adm-tools, .adm-add, .adm-sheet, .adm-chip').forEach((n) => n.remove());
    document.querySelectorAll('.adm-host.is-about').forEach((n) => {
      n.classList.remove('adm-host', 'is-about');
      delete n.dataset.kind;
    });
  }

  function paintChrome() {
    if (!active) return;
    clearChrome();

    const chip = document.createElement('div');
    chip.className = 'adm-chip';
    chip.innerHTML = `
      <span>编辑中</span>
      <button type="button" data-adm-backup>备份</button>
      <button type="button" data-adm-exit>退出</button>`;
    document.body.appendChild(chip);

    placeAdds();
    paintItemTools();
  }

  function placeAdds() {
    const page = document.body.dataset.page;
    const addNear = (el, kind, label) => {
      if (!el || el.querySelector('[data-adm-add="' + kind + '"]')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'adm-add';
      btn.dataset.admAdd = kind;
      btn.title = label;
      btn.innerHTML = ICO.add + '<span>' + label + '</span>';
      el.appendChild(btn);
    };

    if (page === 'index' || page === 'home') {
      document.querySelectorAll('.sec').forEach((sec) => {
        const head = sec.querySelector('.sec__head');
        if (!head) return;
        if (sec.querySelector('[data-slot="articles"]')) addNear(head, 'article', '写文章');
        if (sec.querySelector('[data-slot="notes"]')) addNear(head, 'note', '记手记');
        if (sec.querySelector('[data-slot="photos"]')) addNear(head, 'photo', '传照片');
      });
    }

    const head = document.querySelector('.page-head');
    if (page === 'writing') addNear(head, 'article', '写文章');
    if (page === 'notes') addNear(head, 'note', '记手记');
    if (page === 'moments') addNear(head, 'photo', '传照片');
    if (page === 'about' && head) {
      const aboutBody = document.querySelector('.intro');
      if (aboutBody) {
        aboutBody.classList.add('adm-host', 'is-about');
        aboutBody.dataset.kind = 'about';
        aboutBody.dataset.id = 'about';
      }
      addNear(head, 'about', '改介绍');
    }
  }

  function paintItemTools() {
    document.querySelectorAll('.adm-host[data-kind]').forEach((host) => {
      if (host.querySelector(':scope > .adm-tools')) return;
      const kind = host.dataset.kind;
      const tools = document.createElement('div');
      tools.className = 'adm-tools';
      if (kind === 'article' || kind === 'note' || kind === 'about') {
        tools.innerHTML += `<button type="button" class="adm-ico" data-adm-edit title="编辑">${ICO.edit}</button>`;
      }
      if (kind !== 'about') {
        tools.innerHTML += `<button type="button" class="adm-ico adm-ico--danger" data-adm-del title="删除">${ICO.del}</button>`;
      }
      host.appendChild(tools);
    });
  }

  function closeSheet() {
    document.querySelectorAll('.adm-sheet').forEach((n) => n.remove());
    sheetAnchor = null;
  }

  function openSheet(kind, anchor, editingId) {
    closeSheet();
    sheetAnchor = anchor || null;
    const sheet = document.createElement('div');
    sheet.className = 'adm-sheet';
    sheet.innerHTML = `
      <div class="adm__head">
        <strong>${TITLES[kind] || '编辑'}</strong>
        <button type="button" class="adm__close" data-close aria-label="关闭">${ICO.close}</button>
      </div>
      <form class="adm__form">${FIELDS[kind]()}
        <div class="adm__actions">
          <button type="submit" class="adm__save">保存并发布</button>
          <button type="button" class="adm__cancel" data-close>取消</button>
          <span class="adm__hint">提交后约 1 分钟生效</span>
        </div>
      </form>`;

    const mount = anchor
      || document.querySelector('.page-head')
      || document.querySelector('main .wrap')
      || document.querySelector('main');
    if (anchor && anchor.classList.contains('sec__head')) {
      anchor.parentElement.insertBefore(sheet, anchor.nextSibling);
    } else if (anchor && anchor.classList.contains('adm-host')) {
      anchor.insertAdjacentElement('afterend', sheet);
    } else {
      mount.insertAdjacentElement('afterend', sheet);
    }

    sheet.querySelectorAll('[data-close]').forEach((b) => {
      b.addEventListener('click', () => closeSheet());
    });

    const form = sheet.querySelector('form');
    if (kind === 'about') {
      form.paragraphs.value = ((data().about || {}).paragraphs || []).join('\n\n');
    }
    if (editingId && kind === 'article') fillArticle(form, editingId);
    if (editingId && kind === 'note') fillNote(form, editingId);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit(kind, form);
    });
    if (kind === 'article') wireImageInsert(form, 'body');
    if (kind === 'note') wireImageInsert(form, 'text');

    sheet.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function fillArticle(form, id) {
    const art = data().articles.find((a) => a.id === id);
    if (!art) return;
    form.title.value = art.title || '';
    form.date.value = art.date || today();
    form.minutes.value = art.minutes || '';
    form.excerpt.value = art.excerpt || '';
    form.tags.value = (art.tags || []).join('，');
    form.body.value = art.body || '';
    form.dataset.editing = id;
  }

  function fillNote(form, id) {
    const note = data().notes.find((n) => n.id === id);
    if (!note) return;
    form.date.value = note.date || today();
    form.text.value = note.text || '';
    form.tags.value = (note.tags || []).join('，');
    form.dataset.editing = id;
  }

  function insertAtCursor(ta, text) {
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    const padBefore = before && !/\n\n$/.test(before) ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    const padAfter = after && !/^\n\n/.test(after) ? (after.startsWith('\n') ? '\n' : '\n\n') : '';
    const chunk = padBefore + text + padAfter;
    ta.value = before + chunk + after;
    const caret = (before + chunk).length;
    ta.focus();
    ta.setSelectionRange(caret, caret);
  }

  // 大截图先压到最长边 1600，避免 GitHub 写入失败 / 页面还没部署完就裂图
  async function prepareImage(file) {
    if (file.size > 20 * 1024 * 1024) throw new Error('图片超过 20MB，太大了');
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (e) {
      throw new Error('读不了这张图（试试先另存为 PNG / JPG）');
    }
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const asPng = /png$/i.test(file.type) || /\.png$/i.test(file.name);
    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, asPng ? 'image/png' : 'image/jpeg', 0.86);
    });
    if (!blob) throw new Error('压缩图片失败');
    if (blob.size > 8 * 1024 * 1024) throw new Error('压缩后仍超过 8MB，请换一张小一点的');
    const ext = asPng ? 'png' : 'jpg';
    return { blob, ext, base64: await base64Of(blob) };
  }

  function wireImageInsert(form, fieldName) {
    const ta = form.querySelector(`[name="${fieldName}"]`);
    const btn = form.querySelector('[data-insert-img]');
    const fileInput = form.querySelector('[data-img-file]');
    if (!ta || !btn || !fileInput) return;

    btn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = '处理中…';
      try {
        const id = uid();
        const prepared = await prepareImage(file);
        btn.textContent = '上传中…';
        // 用站根路径 + ?v=，避免相对路径和部署前 404 被浏览器缓存成裂图
        const path = `assets/img/uploads/${id}.${prepared.ext}`;
        const src = `/${path}?v=${id}`;
        const alt = (file.name.replace(/\.[^.]+$/, '') || '图片').slice(0, 40);
        await commitFile(path, prepared.base64, '插图：' + (alt || file.name), true);
        insertAtCursor(ta, `![${alt}](${src})`);
        toast('图片已插入。保存后等约 1 分钟刷新即可看到');
      } catch (err) {
        toast('失败：' + err.message, 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });
  }

  async function remove(kind, id) {
    const key = kind === 'article' ? 'articles' : kind === 'note' ? 'notes' : 'photos';
    const item = data()[key].find((x) => x.id === id);
    if (!item) return;
    const label = item.title || item.caption || item.text || '';
    if (!confirm('删除「' + label.slice(0, 30) + '」？\n内容会从网站移除，但历史记录里还能找回。')) return;

    data()[key] = data()[key].filter((x) => x.id !== id);
    try {
      const noun = kind === 'article' ? '文章' : kind === 'note' ? '手记' : '照片';
      pushTimeline(kind, '删除了' + noun + '：' + label.slice(0, 40));
      await saveJson('删除：' + label.slice(0, 40));
      toast('已删除');
      closeSheet();
      window.KRIS_RERENDER();
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
        const editing = !!form.dataset.editing;
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
        pushTimeline('article', (editing ? '更新了文章：' : '发布了文章：') + item.title);
        await saveJson('文章：' + item.title);
        toast('已保存，约 1 分钟后线上可见');
      }

      if (kind === 'note') {
        const editing = !!form.dataset.editing;
        const id = form.dataset.editing || uid();
        const item = {
          id,
          date: form.date.value || today(),
          text: form.text.value.trim(),
          tags: splitTags(form.tags.value)
        };
        const list = data().notes;
        const i = list.findIndex((n) => n.id === id);
        if (i >= 0) list[i] = item; else list.push(item);
        pushTimeline('note', (editing ? '更新了手记：' : '记了一笔手记：') + item.text.slice(0, 40));
        await saveJson('手记：' + item.text.slice(0, 30));
        toast('已保存，约 1 分钟后线上可见');
      }

      if (kind === 'photo') {
        const file = form.file.files[0];
        if (!file) throw new Error('先选一张图');
        const id = uid();
        const prepared = await prepareImage(file);
        const src = `assets/img/uploads/${id}.${prepared.ext}`;
        const dims = await imageSize(prepared.blob);
        await commitFile(src, prepared.base64, '图片：' + (form.caption.value || file.name), true);
        const caption = form.caption.value.trim();
        data().photos.push({
          id, src, caption,
          date: form.date.value || today(),
          width: dims.w, height: dims.h
        });
        pushTimeline('photo', '上传了照片：' + (caption || file.name).slice(0, 40));
        await saveJson('照片：' + (caption || file.name));
        toast('已上传，约 1 分钟后可见');
      }

      if (kind === 'about') {
        const text = form.paragraphs.value.trim();
        data().about = { paragraphs: text ? text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) : [] };
        pushTimeline('about', '更新了关于');
        await saveJson('关于：更新自我介绍');
        toast('已保存，约 1 分钟后生效');
      }

      closeSheet();
      window.KRIS_RERENDER();
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

  function unlock(silent) {
    const guess = prompt('输入编辑密码：');
    if (guess === null) return false;
    if (guess !== PASS) {
      if (!silent) alert('密码不对');
      return false;
    }
    active = true;
    document.body.classList.add('is-editing');
    paintChrome();
    if (!silent) toast('编辑模式已开启：点页面上的 + / 编辑 / 删除');
    document.dispatchEvent(new CustomEvent('kris:admin'));
    return true;
  }

  function exit() {
    active = false;
    document.body.classList.remove('is-editing');
    closeSheet();
    clearChrome();
    toast('已退出编辑模式');
  }

  document.addEventListener('click', (e) => {
    if (!active) return;
    const exitBtn = e.target.closest('[data-adm-exit]');
    if (exitBtn) { e.preventDefault(); return exit(); }
    const backupBtn = e.target.closest('[data-adm-backup]');
    if (backupBtn) { e.preventDefault(); return backup(); }

    const add = e.target.closest('[data-adm-add]');
    if (add) {
      e.preventDefault();
      const kind = add.dataset.admAdd;
      if (kind === 'about') return openSheet('about', add.closest('.page-head') || add.parentElement);
      return openSheet(kind, add.closest('.sec__head') || add.closest('.page-head') || add.parentElement);
    }

    const edit = e.target.closest('[data-adm-edit]');
    if (edit) {
      e.preventDefault();
      e.stopPropagation();
      const host = edit.closest('.adm-host');
      if (!host) return;
      const kind = host.dataset.kind;
      const id = host.dataset.id;
      if (kind === 'about') return openSheet('about', document.querySelector('.page-head') || host);
      return openSheet(kind, host, id);
    }

    const del = e.target.closest('[data-adm-del]');
    if (del) {
      e.preventDefault();
      e.stopPropagation();
      const host = del.closest('.adm-host');
      if (!host) return;
      return remove(host.dataset.kind, host.dataset.id);
    }
  }, true);

  document.addEventListener('kris:rendered', () => {
    if (active) paintChrome();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      if (active) exit(); else unlock();
    }
  });

  if (/[?&]admin=1/.test(location.search)) {
    document.addEventListener('kris:rendered', () => unlock(true), { once: true });
  }
})();

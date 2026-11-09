/* ==========================================================================
   Kris — 页面数据渲染
   所有内容来自 content/site.json；页面只是壳子。
   没有数据时保留 HTML 里的 .empty 占位行。
   ========================================================================== */

(function () {
  'use strict';

  const API = {
    data: 'content/site.json',
    dataUrl() {
      return this.data + '?v=' + Date.now();
    }
  };

  const MONTH = (d) => {
    const [y, m, day] = (d || '').split('-');
    return { y, dot: `${m}.${day}`, full: `${y}.${m}.${day}`, md: `${m}·${day}` };
  };

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  /* 极简标记：## 小标题、> 引用、- 列表、**粗体**、`代码` */
  const inline = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  function renderBody(body) {
    const blocks = String(body || '').split(/\n{2,}/);
    const out = [];

    blocks.forEach((raw) => {
      const block = raw.trim();
      if (!block) return;

      if (/^##\s/.test(block)) {
        out.push('<h2>' + inline(block.replace(/^##\s+/, '')) + '</h2>');
        return;
      }

      if (/^>\s/.test(block)) {
        const ps = block.split('\n').map((l) => l.replace(/^>\s?/, '').trim()).filter(Boolean);
        out.push('<blockquote><p>' + inline(ps.join(' ')) + '</p></blockquote>');
        return;
      }

      if (/^[-*]\s/.test(block)) {
        const items = block.split('\n').filter((l) => /^[-*]\s/.test(l))
          .map((l) => '<li>' + inline(l.replace(/^[-*]\s+/, '')) + '</li>');
        out.push('<ul>' + items.join('') + '</ul>');
        return;
      }

      const ps = block.split('\n').map((l) => l.trim()).filter(Boolean);
      ps.forEach((p) => out.push('<p>' + inline(p) + '</p>'));
    });

    return out.join('\n');
  }

  const oldest = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

  /* ---------- 首页 ---------- */
  function renderHome(data) {
    const arts = (data.articles || []).slice().sort(oldest).slice(0, 3);
    const notes = (data.notes || []).slice().sort(oldest).slice(0, 6);
    const photos = (data.photos || []).slice().sort(oldest).slice(0, 5);

    setList('[data-slot="articles"]', arts.length ? arts.map((a) => `
      <a class="entry" href="post.html?p=${encodeURIComponent(a.id)}">
        <div class="entry__date">${esc(MONTH(a.date).full)}</div>
        <div>
          <h3 class="entry__title">${esc(a.title)}</h3>
          ${a.excerpt ? `<p class="entry__desc">${esc(a.excerpt)}</p>` : ''}
          <div class="entry__meta">${[].concat(a.tags || [], a.minutes ? a.minutes + ' 分钟' : []).filter(Boolean).map(esc).join(' · ')}</div>
        </div>
      </a>`).join('') : '');

    setList('[data-slot="notes"]', notes.length ? notes.map((n) => `
      <article class="note">
        <div class="note__date">${esc(MONTH(n.date).full)}</div>
        <p class="note__text">${inline(n.text)}</p>
      </article>`).join('') : '');

    setList('[data-slot="photos"]', photos.length ? photos.map((p) => `
      <a href="moments.html"><img src="${esc(p.src)}" alt="${esc(p.caption)}" width="${p.width || 1200}" height="${p.height || 1200}" loading="lazy"></a>`).join('') : '');
  }

  /* ---------- 文章列表 ---------- */
  function renderWriting(data) {
    const arts = (data.articles || []).slice().sort(oldest);
    const years = {};
    arts.forEach((a) => {
      const y = MONTH(a.date).y;
      (years[y] = years[y] || []).push(a);
    });

    setList('[data-slot="articles"]', Object.keys(years).sort((a, b) => b - a).map((y) => `
      <section class="year">
        <h2 class="year__label">${esc(y)}</h2>
        ${years[y].map((a) => `
          <a class="row" href="post.html?p=${encodeURIComponent(a.id)}">
            <span class="row__date">${esc(MONTH(a.date).md)}</span>
            <span class="row__title">${esc(a.title)}</span>
            <span class="row__tags">${(a.tags || []).map(esc).join(' · ')}</span>
          </a>`).join('')}
      </section>`).join(''));
  }

  /* ---------- 手记 ---------- */
  function renderNotes(data) {
    const notes = (data.notes || []).slice().sort(oldest);
    setList('[data-slot="notes"]', notes.map((n) => `
      <article class="note">
        <div class="note__date">${esc(MONTH(n.date).full)}</div>
        <p class="note__text">${inline(n.text)}</p>
      </article>`).join(''));
  }

  /* ---------- 照片 ---------- */
  function renderMoments(data) {
    const photos = (data.photos || []).slice().sort(oldest);
    setList('[data-slot="photos"]', photos.map((p) => `
      <figure data-src="${esc(p.src)}" data-cap="${esc(p.caption)}">
        <img src="${esc(p.src)}" alt="${esc(p.caption)}" width="${p.width || 1200}" height="${p.height || 1200}" loading="lazy">
        <figcaption>${esc(p.caption)}</figcaption>
      </figure>`).join(''));
  }

  /* ---------- 关于 ---------- */
  function renderAbout(data) {
    const ps = (data.about && data.about.paragraphs) || [];
    setList('[data-slot="about"]', ps.map((t) => '<p>' + inline(t) + '</p>').join(''));
  }

  /* ---------- 文章页 ---------- */
  function renderPost(data) {
    const id = new URLSearchParams(location.search).get('p');
    const art = (data.articles || []).find((a) => a.id === id);

    if (!art) {
      document.querySelector('[data-slot="post"]').innerHTML =
        '<p class="empty">这篇文章不在了。<a href="writing.html">回到文章列表</a></p>';
      return;
    }

    document.title = art.title + ' — Kris';
    const meta = document.querySelector('#post-desc');
    if (meta && art.excerpt) meta.setAttribute('content', art.excerpt);

    document.querySelector('[data-slot="post"]').innerHTML = `
      <article>
        <div class="wrap">
          <header class="article__head">
            <div class="article__meta">
              <span>${esc(MONTH(art.date).full)}</span>
              ${art.minutes ? `<span>${esc(art.minutes)} 分钟读完</span>` : ''}
              ${(art.tags || []).length ? `<span>${(art.tags || []).map(esc).join(' · ')}</span>` : ''}
            </div>
            <h1 class="article__title">${esc(art.title)}</h1>
            ${art.excerpt ? `<p class="article__lede">${esc(art.excerpt)}</p>` : ''}
          </header>
          <div class="prose">${renderBody(art.body)}</div>
          <footer class="article__foot">
            <div class="article__tags">${(art.tags || []).map(esc).join(' · ')}</div>
            <a class="sec__more" href="writing.html">← 回到文章列表</a>
          </footer>
        </div>
      </article>`;
  }

  /* 把渲染结果写进槽位，并切换空状态 */
  function setList(sel, html) {
    document.querySelectorAll(sel).forEach((el) => {
      el.innerHTML = html;
      const empty = el.parentElement.querySelector('.empty');
      if (empty) empty.hidden = html.trim() !== '';
      el.hidden = html.trim() === '';
    });
  }

  const PERMALINK = { writing: 'writing.html', notes: 'notes.html', moments: 'moments.html' };

  /* 用给定的数据把当前页渲染一遍（编辑器保存后走这里，不重新拉取） */
  function apply(data) {
    window.KRIS_DATA = data;

    const page = document.body.dataset.page;
    const map = {
      home: renderHome,
      index: renderHome,
      writing: renderWriting,
      notes: renderNotes,
      about: renderAbout,
      post: renderPost,
      moments: renderMoments
    };

    // 列表页保存后，新增的条目在这一页看不到，提示去对应页面
    if (map[page]) map[page](data);

    document.dispatchEvent(new CustomEvent('kris:rendered', { detail: data }));
  }

  async function start() {
    let data = { about: { paragraphs: [] }, articles: [], notes: [], photos: [] };
    try {
      const res = await fetch(API.dataUrl(), { cache: 'no-store' });
      if (res.ok) data = await res.json();
    } catch (e) {
      /* file:// 或离线时保持空数据 */
    }
    apply(data);
  }

  window.KRIS_RERENDER = () => apply(window.KRIS_DATA || { about: { paragraphs: [] }, articles: [], notes: [], photos: [] });
  window.KRIS_RENDER = start;
  window.KRIS_BODY = renderBody;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

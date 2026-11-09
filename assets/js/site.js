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

  /* 极简标记：## 小标题、> 引用、- 列表、**粗体**、`代码`、![说明](图片地址) */
  // 允许 assets/...、/assets/...，以及带 ?v= 防缓存参数
  const safeSrc = (s) => /^(?:\/)?assets\/|https?:\/\//i.test(s || '');

  const inline = (t) => esc(t)
    .replace(/!\[([^\]]*)\]\(((?:\/)?assets\/[^)\s]+|https?:\/\/[^)\s]+)\)/gi,
      '<img class="prose__inline-img" src="$2" alt="$1" loading="lazy">')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  function figureImg(alt, src) {
    if (!safeSrc(src)) return '<p>' + inline(`![${alt}](${src})`) + '</p>';
    return `<figure class="prose__img"><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy"></figure>`;
  }

  function renderBody(body) {
    const blocks = String(body || '').split(/\n{2,}/);
    const out = [];

    blocks.forEach((raw) => {
      const block = raw.trim();
      if (!block) return;

      const onlyImg = block.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
      if (onlyImg) {
        out.push(figureImg(onlyImg[1], onlyImg[2]));
        return;
      }

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
      ps.forEach((p) => {
        const img = p.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
        if (img) out.push(figureImg(img[1], img[2]));
        else out.push('<p>' + inline(p) + '</p>');
      });
    });

    return out.join('\n');
  }

  // 最新在上：先比日期，同一天再比 id（后创建的 id 更大）
  const newest = (a, b) => {
    const da = a.date || '';
    const db = b.date || '';
    if (da !== db) return da < db ? 1 : -1;
    return String(b.id || '').localeCompare(String(a.id || ''));
  };

  /* ---------- 首页 ---------- */
  function renderHome(data) {
    const arts = (data.articles || []).slice().sort(newest).slice(0, 3);
    const notes = (data.notes || []).slice().sort(newest).slice(0, 6);
    const photos = (data.photos || []).slice().sort(newest).slice(0, 5);

    setList('[data-slot="articles"]', arts.length ? arts.map((a) => `
      <div class="adm-host" data-kind="article" data-id="${esc(a.id)}">
        <a class="entry" href="post.html?p=${encodeURIComponent(a.id)}">
          <div class="entry__date">${esc(MONTH(a.date).full)}</div>
          <div>
            <h3 class="entry__title">${esc(a.title)}</h3>
            ${a.excerpt ? `<p class="entry__desc">${esc(a.excerpt)}</p>` : ''}
            <div class="entry__meta">${[].concat(a.tags || [], a.minutes ? a.minutes + ' 分钟' : []).filter(Boolean).map(esc).join(' · ')}</div>
          </div>
        </a>
      </div>`).join('') : '');

    setList('[data-slot="notes"]', notes.length ? notes.map((n) => `
      <article class="note adm-host" data-kind="note" data-id="${esc(n.id)}">
        <div class="note__date">${esc(MONTH(n.date).full)}</div>
        <div class="note__main">
          <div class="note__text">${renderBody(n.text)}</div>
          ${noteTagsHtml(n.tags, false)}
        </div>
      </article>`).join('') : '');

    setList('[data-slot="photos"]', photos.length ? photos.map((p) => `
      <div class="adm-host strip__cell" data-kind="photo" data-id="${esc(p.id)}">
        <a href="moments.html"><img src="${esc(p.src)}" alt="${esc(p.caption)}" width="${p.width || 1200}" height="${p.height || 1200}" loading="lazy"></a>
      </div>`).join('') : '');
  }

  /* ---------- 文章列表 ---------- */
  function renderWriting(data) {
    const arts = (data.articles || []).slice().sort(newest);
    const years = {};
    arts.forEach((a) => {
      const y = MONTH(a.date).y;
      (years[y] = years[y] || []).push(a);
    });

    setList('[data-slot="articles"]', Object.keys(years).sort((a, b) => b - a).map((y) => `
      <section class="year">
        <h2 class="year__label">${esc(y)}</h2>
        ${years[y].map((a) => `
          <div class="adm-host" data-kind="article" data-id="${esc(a.id)}">
            <a class="row" href="post.html?p=${encodeURIComponent(a.id)}">
              <span class="row__date">${esc(MONTH(a.date).md)}</span>
              <span class="row__title">${esc(a.title)}</span>
              <span class="row__tags">${(a.tags || []).map(esc).join(' · ')}</span>
            </a>
          </div>`).join('')}
      </section>`).join(''));
  }

  /* ---------- 手记 ---------- */
  let notesTag = '';

  function noteTagsHtml(tags, clickable) {
    const list = (tags || []).filter(Boolean);
    if (!list.length) return '';
    if (!clickable) {
      return `<div class="note__tags">${list.map((t) =>
        `<span class="note__tag">${esc(t)}</span>`).join('')}</div>`;
    }
    return `<div class="note__tags">${list.map((t) =>
      `<button type="button" class="note__tag${notesTag === t ? ' is-on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`
    ).join('')}</div>`;
  }

  function collectNoteTags(notes) {
    const seen = new Set();
    const out = [];
    notes.forEach((n) => {
      (n.tags || []).forEach((t) => {
        if (!t || seen.has(t)) return;
        seen.add(t);
        out.push(t);
      });
    });
    return out.sort((a, b) => a.localeCompare(b, 'zh'));
  }

  function renderNoteFilters(notes) {
    const tags = collectNoteTags(notes);
    const bar = document.querySelector('[data-slot="note-tags"]');
    if (!bar) return;
    if (!tags.length) {
      bar.hidden = true;
      bar.innerHTML = '';
      return;
    }
    const chip = (label, value) => {
      const on = (value === '' && !notesTag) || (value !== '' && notesTag === value);
      return `<button type="button" class="ntag${on ? ' is-on' : ''}" data-tag="${esc(value)}">${esc(label)}</button>`;
    };
    bar.innerHTML = chip('全部', '') + tags.map((t) => chip(t, t)).join('');
    bar.hidden = false;
  }

  function renderNotes(data) {
    const all = (data.notes || []).slice().sort(newest);
    if (notesTag && !all.some((n) => (n.tags || []).includes(notesTag))) {
      notesTag = '';
    }
    renderNoteFilters(all);

    const notes = notesTag
      ? all.filter((n) => (n.tags || []).includes(notesTag))
      : all;

    if (!all.length) {
      setList('[data-slot="notes"]', '');
      return;
    }

    if (!notes.length) {
      setList('[data-slot="notes"]',
        `<p class="notes__none">没有「${esc(notesTag)}」这个标签的手记。</p>`);
      return;
    }

    setList('[data-slot="notes"]', notes.map((n) => `
      <article class="note adm-host" data-kind="note" data-id="${esc(n.id)}">
        <div class="note__date">${esc(MONTH(n.date).full)}</div>
        <div class="note__main">
          <div class="note__text">${renderBody(n.text)}</div>
          ${noteTagsHtml(n.tags, true)}
        </div>
      </article>`).join(''));
  }

  document.addEventListener('click', (e) => {
    if (document.body.dataset.page !== 'notes') return;
    const btn = e.target.closest('.ntag[data-tag], .note__tag[data-tag]');
    if (!btn) return;
    e.preventDefault();
    notesTag = btn.getAttribute('data-tag') || '';
    renderNotes(window.KRIS_DATA || { notes: [] });
  });

  /* ---------- 照片 ---------- */
  function renderMoments(data) {
    const photos = (data.photos || []).slice().sort(newest);
    setList('[data-slot="photos"]', photos.map((p) => `
      <figure class="adm-host" data-kind="photo" data-id="${esc(p.id)}" data-src="${esc(p.src)}" data-cap="${esc(p.caption)}">
        <img src="${esc(p.src)}" alt="${esc(p.caption)}" width="${p.width || 1200}" height="${p.height || 1200}" loading="lazy">
        <figcaption>${esc(p.caption)}</figcaption>
      </figure>`).join(''));
  }

  /* ---------- 关于 ---------- */
  function renderAbout(data) {
    const ps = (data.about && data.about.paragraphs) || [];
    setList('[data-slot="about"]', ps.map((t) => '<p>' + inline(t) + '</p>').join(''));
  }

  /* ---------- 时间线：最新在最上 ---------- */
  function fmtWhen(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!m) return esc(s || '');
    return m[4] ? `${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}` : `${m[1]}.${m[2]}.${m[3]}`;
  }

  function renderTimeline(data) {
    const items = (data.timeline || []).slice();
    setList('[data-slot="timeline"]', items.map((it, i) => `
      <li class="tl__item" data-kind="${esc(it.kind || '')}">
        <span class="tl__dot" aria-hidden="true"></span>
        ${i < items.length - 1 ? '<span class="tl__rail" aria-hidden="true"></span>' : ''}
        <time class="tl__when" datetime="${esc(it.date || '')}">${fmtWhen(it.date)}</time>
        <p class="tl__text">${esc(it.text || '')}</p>
      </li>`).join(''));
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
      <article class="adm-host" data-kind="article" data-id="${esc(art.id)}">
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


  /* ---------- 首屏短句 ---------- */
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function renderHero() {
    const box = document.querySelector('[data-quote]');
    const list = window.KRIS_QUOTES || [];
    if (!box || !list.length) return;

    // 避免连续两次抽到同一句
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && String(i) === sessionStorage.getItem('quote-last')) {
      i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
    }
    sessionStorage.setItem('quote-last', String(i));

    const q = list[i];
    const foreign = !!q.zh;

    const text = box.querySelector('.q__text');
    const by = box.querySelector('.q__by');
    const meta = box.querySelector('.q__meta');

    text.textContent = q.text;
    text.setAttribute('lang', foreign ? q.lang : 'zh');
    by.textContent = q.author + (q.source || '');

    // 外文才给「译」按钮
    const oldBtn = box.querySelector('.q__toggle');
    if (oldBtn) oldBtn.remove();

    if (foreign) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'q__toggle';
      btn.textContent = '译';
      btn.setAttribute('aria-label', '显示中文译文');
      btn.setAttribute('aria-pressed', 'false');
      meta.appendChild(btn);

      let showingZh = false;

      btn.addEventListener('click', () => {
        showingZh = !showingZh;
        const next = showingZh ? q.zh : q.text;

        btn.setAttribute('aria-pressed', String(showingZh));
        btn.setAttribute('aria-label', showingZh ? '显示原文' : '显示中文译文');
        btn.textContent = showingZh ? '原' : '译';
        text.setAttribute('lang', showingZh ? 'zh' : q.lang);

        if (reduceMotion() || !text.animate) {
          text.textContent = next;
          return;
        }

        // 溶解：原句上浮淡出，译文自下淡入
        text.animate(
          [
            { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
            { opacity: 0, transform: 'translateY(-8px)', filter: 'blur(3px)' }
          ],
          { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }
        ).finished.then(() => {
          text.textContent = next;
          return text.animate(
            [
              { opacity: 0, transform: 'translateY(8px)', filter: 'blur(3px)' },
              { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }
            ],
            { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' }
          ).finished;
        }).then(() => {
          text.getAnimations().forEach((a) => a.cancel());
        });
      });
    }
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
      moments: renderMoments,
      timeline: renderTimeline
    };

    // 列表页保存后，新增的条目在这一页看不到，提示去对应页面
    if (page === 'home' || page === 'index') renderHero();
    if (map[page]) map[page](data);

    document.dispatchEvent(new CustomEvent('kris:rendered', { detail: data }));
  }

  async function start() {
    let data = { about: { paragraphs: [] }, articles: [], notes: [], photos: [], timeline: [] };
    try {
      const res = await fetch(API.dataUrl(), { cache: 'no-store' });
      if (res.ok) data = await res.json();
    } catch (e) {
      /* file:// 或离线时保持空数据 */
    }
    if (!Array.isArray(data.timeline)) data.timeline = [];
    apply(data);
  }

  window.KRIS_RERENDER = () => apply(window.KRIS_DATA || { about: { paragraphs: [] }, articles: [], notes: [], photos: [], timeline: [] });
  window.KRIS_RENDER = start;
  window.KRIS_BODY = renderBody;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

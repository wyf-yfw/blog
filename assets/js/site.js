/* ==========================================================================
   Kris — 页面数据渲染
   所有内容来自 /api/site；页面只是壳子。
   没有数据时保留 HTML 里的 .empty 占位行。
   ========================================================================== */

(function () {
  'use strict';

  const API = {
    data: '/api/site',
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
  // 允许 assets/...、/assets/...、/media/...，以及带 ?v= 防缓存参数
  const safeSrc = (s) => /^(?:\/)?assets\/|^\/media\/|https?:\/\//i.test(s || '');

  const inline = (t) => esc(t)
    .replace(/!\[([^\]]*)\]\(((?:\/)?assets\/[^)\s]+|\/media\/[^)\s]+|https?:\/\/[^)\s]+)\)/gi,
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

    setList('[data-slot="articles"]', arts.length ? arts.map((a) => `
      <div class="adm-host" data-kind="article" data-id="${esc(a.id)}">
        <a class="entry" href="post.html?p=${encodeURIComponent(a.id)}">
          <div class="entry__date">${esc(MONTH(a.date).full)}</div>
          <div>
            <h3 class="entry__title">${esc(a.title)}</h3>
            ${a.excerpt ? `<p class="entry__desc">${esc(a.excerpt)}</p>` : ''}
            <div class="entry__meta">${[].concat(a.category || [], a.tags || [], a.minutes ? a.minutes + ' 分钟' : []).filter(Boolean).map(esc).join(' · ')}</div>
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
  }

  /* ---------- 文章列表 ---------- */
  const ARTICLE_CATS = ['学记', '省察', '所见', '存档'];
  const ARTICLE_HEAD = {
    '': {
      title: '文章 — Kris',
      desc: '我的语言的界限，意味着我的世界的界限。'
    },
    '学记': {
      title: '学记 — Kris',
      desc: '弄懂一件事，再把它写明白。'
    },
    '省察': {
      title: '省察 — Kris',
      desc: '行为背后，总有未被说出的理由。'
    },
    '所见': {
      title: '所见 — Kris',
      desc: '对这件事怎么看，以及它通向何处。'
    },
    '存档': {
      title: '存档 — Kris',
      desc: '把人生里真正重要的几天留下来。'
    }
  };

  function catFromUrl() {
    const c = new URLSearchParams(location.search).get('cat') || '';
    return ARTICLE_CATS.includes(c) ? c : '';
  }

  let articlesCat = (typeof window.KRIS_ARTICLE_CAT === 'string' && ARTICLE_CATS.includes(window.KRIS_ARTICLE_CAT))
    ? window.KRIS_ARTICLE_CAT
    : catFromUrl();

  function syncCatUrl(cat) {
    if (document.body.dataset.page !== 'writing') return;
    const url = new URL(location.href);
    if (cat) url.searchParams.set('cat', cat);
    else url.searchParams.delete('cat');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }

  function articleMeta(a) {
    return [].concat(a.category || [], a.tags || []).filter(Boolean);
  }

  function renderWritingHead() {
    const head = document.querySelector('[data-slot="writing-head"]');
    if (!head) return;
    const sub = head.querySelector('[data-writing-sub]');
    const desc = head.querySelector('[data-writing-desc]');
    const meta = ARTICLE_HEAD[articlesCat] || ARTICLE_HEAD[''];
    const nextDesc = meta.desc;
    const nextSub = articlesCat || '';
    // 内容没变就别写 DOM，避免分类落地后再闪一次
    if (document.title !== meta.title) document.title = meta.title;
    if (desc && desc.textContent !== nextDesc) desc.textContent = nextDesc;
    if (sub) {
      if (nextSub) {
        if (sub.textContent !== nextSub) sub.textContent = nextSub;
        if (sub.hidden) sub.hidden = false;
      } else if (!sub.hidden || sub.textContent) {
        sub.textContent = '';
        sub.hidden = true;
      }
    }
    document.documentElement.classList.add('writing-head-ready');
    if (articlesCat) document.documentElement.dataset.writingCat = articlesCat;
    else delete document.documentElement.dataset.writingCat;
  }

  function renderArticleFilters(all) {
    const bar = document.querySelector('[data-slot="article-cats"]');
    if (!bar) return;
    if (!all.length) {
      bar.hidden = true;
      bar.innerHTML = '';
      return;
    }
    const chip = (label, value) => {
      const on = (value === '' && !articlesCat) || (value !== '' && articlesCat === value);
      return `<button type="button" class="ntag${on ? ' is-on' : ''}" data-cat="${esc(value)}">${esc(label)}</button>`;
    };
    bar.innerHTML = chip('全部', '') + ARTICLE_CATS.map((c) => chip(c, c)).join('');
    bar.hidden = false;
  }

  function renderWriting(data) {
    const all = (data.articles || []).slice().sort(newest);
    if (articlesCat && !ARTICLE_CATS.includes(articlesCat)) articlesCat = '';
    renderWritingHead();
    renderArticleFilters(all);

    const arts = articlesCat
      ? all.filter((a) => a.category === articlesCat)
      : all;

    if (!all.length) {
      setList('[data-slot="articles"]', '');
      return;
    }

    if (!arts.length) {
      setList('[data-slot="articles"]',
        `<p class="notes__none">还没有「${esc(articlesCat)}」类的文章。</p>`);
      return;
    }

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
              <span class="row__tags">${articleMeta(a).map(esc).join(' · ')}</span>
            </a>
          </div>`).join('')}
      </section>`).join(''));
  }

  document.addEventListener('click', (e) => {
    if (document.body.dataset.page !== 'writing') return;
    const btn = e.target.closest('.ntag[data-cat]');
    if (!btn) return;
    e.preventDefault();
    articlesCat = btn.getAttribute('data-cat') || '';
    syncCatUrl(articlesCat);
    renderWriting(window.KRIS_DATA || { articles: [] });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

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
    items.forEach((it) => {
      if (!it.id) it.id = 'tl' + Math.random().toString(36).slice(2, 10);
    });
    setList('[data-slot="timeline"]', items.map((it, i) => `
      <li class="tl__item adm-host" data-kind="timeline" data-id="${esc(it.id)}" data-src-kind="${esc(it.kind || '')}">
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

    const metaBits = [MONTH(art.date).full]
      .concat(art.minutes ? art.minutes + ' 分钟读完' : [])
      .concat(art.category || [])
      .concat(art.tags || [])
      .filter(Boolean);

    document.querySelector('[data-slot="post"]').innerHTML = `
      <article class="adm-host" data-kind="article" data-id="${esc(art.id)}">
        <div class="wrap">
          <header class="article__head">
            <h1 class="article__title">${esc(art.title)}</h1>
            ${metaBits.length ? `<div class="article__meta">${metaBits.map(esc).join(' · ')}</div>` : ''}
            ${art.excerpt ? `<p class="article__lede">${esc(art.excerpt)}</p>` : ''}
          </header>
          <div class="prose${art.excerpt ? ' prose--after-lede' : ''}">${renderBody(art.body)}</div>
          <footer class="article__foot article__foot--solo">
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

  const PERMALINK = { writing: 'writing.html', notes: 'notes.html' };

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
      timeline: renderTimeline
    };

    // 列表页保存后，新增的条目在这一页看不到，提示去对应页面
    if (page === 'home' || page === 'index') renderHero();
    if (map[page]) map[page](data);

    document.dispatchEvent(new CustomEvent('kris:rendered', { detail: data }));
  }

  function dataFingerprint(data) {
    try { return JSON.stringify(data); } catch (e) { return ''; }
  }

  let lastFingerprint = '';

  function showLoadError() {
    document.querySelectorAll(".empty").forEach((el) => { el.hidden = true; });
    const main = document.querySelector("#main");
    if (!main || main.querySelector("[data-load-error]")) return;
    const p = document.createElement("p");
    p.className = "empty";
    p.hidden = false;
    p.dataset.loadError = "1";
    p.textContent = "暂时读不到内容";
    main.prepend(p);
  }

  async function start() {
    try {
      const res = await fetch(API.dataUrl(), { cache: "no-store" });
      if (!res.ok) {
        showLoadError();
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data.timeline)) data.timeline = [];
      lastFingerprint = dataFingerprint(data);
      apply(data);
    } catch (e) {
      showLoadError();
    }
  }

  /* 后台内容有更新时，静默重拉接口，免手动刷新 */
  async function softRefreshContent() {
    if (document.hidden) return;
    try {
      const res = await fetch(API.dataUrl(), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data.timeline)) data.timeline = [];
      const next = dataFingerprint(data);
      if (!next || next === lastFingerprint) return;
      lastFingerprint = next;
      apply(data);
    } catch (e) { /* 忽略瞬时网络错误 */ }
  }

  setInterval(softRefreshContent, 45000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) softRefreshContent();
  });

  window.KRIS_RERENDER = () => {
    const data = window.KRIS_DATA || { about: { paragraphs: [] }, articles: [], notes: [], photos: [], timeline: [] };
    lastFingerprint = dataFingerprint(data);
    apply(data);
  };
  window.KRIS_RENDER = start;
  window.KRIS_BODY = renderBody;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

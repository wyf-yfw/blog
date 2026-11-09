/* ==========================================================================
   Kris — 交互
   手机菜单、照片墙分栏、照片灯箱。内容由 site.js 渲染，所以照片墙和灯箱
   要等 kris:rendered 之后再初始化。
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- 手机菜单 ---------- */
  const nav = document.querySelector('[data-nav]');
  const navToggle = document.querySelector('[data-nav-toggle]');

  function closeNav() {
    if (!nav || !navToggle) return;
    nav.classList.remove('nav--open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', '打开菜单');
  }

  if (nav && navToggle) {
    navToggle.addEventListener('click', () => {
      const open = nav.classList.toggle('nav--open');
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
    });

    nav.addEventListener('click', (e) => {
      if (e.target.closest('.nav__link')) closeNav();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('nav--open')) {
        closeNav();
        navToggle.focus();
      }
    });
  }

  /* ---------- 照片墙 + 灯箱 ---------- */
  // 内容会被重新渲染，所以用事件委托，事件只绑一次
  let lbBound = false;
  let resizeBound = false;

  function layoutWall() {
    const wall = document.querySelector('[data-masonry]');
    if (!wall) return;

    const count = window.innerWidth <= 900 ? 2 : 3;
    const figures = Array.from(wall.querySelectorAll('figure'));

    Array.from(wall.querySelectorAll('.masonry__col')).forEach((col) => {
      Array.from(col.children).forEach((fig) => wall.appendChild(fig));
      col.remove();
    });

    const cols = Array.from({ length: count }, () => {
      const col = document.createElement('div');
      col.className = 'masonry__col';
      return col;
    });
    const heights = new Array(count).fill(0);

    figures.forEach((fig) => {
      const img = fig.querySelector('img');
      const ratio = img && img.naturalWidth
        ? img.naturalHeight / img.naturalWidth
        : (img && img.getAttribute('width') && img.getAttribute('height')
            ? +img.getAttribute('height') / +img.getAttribute('width')
            : 1);

      let target = 0;
      for (let i = 1; i < count; i++) if (heights[i] < heights[target]) target = i;

      cols[target].appendChild(fig);
      heights[target] += ratio + 0.14;
    });

    cols.forEach((col) => wall.appendChild(col));
    wall.classList.add('is-laid');
    wall.dataset.cols = String(count);
  }

  function initPhotos() {
    const wall = document.querySelector('[data-masonry]');
    if (!wall) return;

    layoutWall();

    if (!resizeBound) {
      resizeBound = true;
      let t;
      window.addEventListener('resize', () => {
        clearTimeout(t);
        t = setTimeout(layoutWall, 150);
      });
    }

    const lb = document.querySelector('[data-lb]');
    if (!lb || lbBound) return;
    lbBound = true;

    const imgEl = lb.querySelector('[data-lb-img]');
    const capEl = lb.querySelector('[data-lb-cap]');
    const btnClose = lb.querySelector('[data-lb-close]');
    const btnPrev = lb.querySelector('[data-lb-prev]');
    const btnNext = lb.querySelector('[data-lb-next]');

    let shots = [];
    let index = 0;
    let lastFocus = null;

    const collect = () => Array.from(document.querySelectorAll('[data-lightbox-set] figure')).map((fig) => ({
      src: fig.dataset.src,
      cap: fig.dataset.cap || '',
      alt: fig.querySelector('img') ? fig.querySelector('img').alt : ''
    }));

    const render = () => {
      const shot = shots[index];
      if (!shot) return;
      imgEl.src = shot.src;
      imgEl.alt = shot.alt;
      capEl.textContent = shot.cap;
    };

    const open = (i) => {
      shots = collect();
      if (!shots.length) return;
      index = i;
      lastFocus = document.activeElement;
      render();
      lb.hidden = false;
      lb.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      btnClose.focus();
    };

    const close = () => {
      lb.classList.remove('is-open');
      lb.hidden = true;
      document.body.style.overflow = '';
      imgEl.removeAttribute('src');
      if (lastFocus) lastFocus.focus();
    };

    const go = (step) => {
      if (!shots.length) return;
      index = (index + step + shots.length) % shots.length;
      render();
    };

    document.addEventListener('click', (e) => {
      const fig = e.target.closest('[data-lightbox-set] figure');
      if (!fig) return;
      const i = Array.from(document.querySelectorAll('[data-lightbox-set] figure')).indexOf(fig);
      if (i >= 0) open(i);
    });

    document.addEventListener('keydown', (e) => {
      const fig = document.activeElement;
      if (!lb.hidden) {
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowLeft') go(-1);
        if (e.key === 'ArrowRight') go(1);
        return;
      }
      if (fig && fig.matches('[data-lightbox-set] figure') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        open(collect().findIndex((s) => s.src === fig.dataset.src));
      }
    });

    btnClose.addEventListener('click', close);
    btnPrev.addEventListener('click', () => go(-1));
    btnNext.addEventListener('click', () => go(1));
    lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  }

  document.addEventListener('kris:rendered', initPhotos);
})();

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



  /* ---------- 导航黑线 ---------- */
  const navLinks = document.querySelector('.nav__links');
  const navLine = document.querySelector('[data-nav-line]');
  const links = navLinks ? Array.from(navLinks.querySelectorAll('.nav__link')) : [];
  const activeIndex = () => links.findIndex((a) => a.getAttribute('aria-current') === 'page');

  function placeLine(link, animate) {
    if (!navLine || !link) return;
    const left = link.offsetLeft;
    const width = link.offsetWidth;
    if (!animate) navLine.classList.remove('is-ready');
    navLine.style.width = width + 'px';
    navLine.style.transform = 'translateX(' + left + 'px)';
    if (!animate) {
      void navLine.offsetWidth;   // 先落位再加过渡，避免首帧也跟着补间
      navLine.classList.add('is-ready');
    }
  }

  if (navLinks && navLine && links.length) {
    const from = sessionStorage.getItem('nav-from');
    sessionStorage.removeItem('nav-from');
    const current = activeIndex();

    if (from !== null && Number(from) !== current && Number.isFinite(Number(from))) {
      // 从上一页的位置起步，下一帧滑到当前页
      placeLine(links[Number(from)], false);
      requestAnimationFrame(() => requestAnimationFrame(() => placeLine(links[current], true)));
    } else {
      placeLine(links[current], false);
    }

    // 悬停时黑线临时滑过去，移开再回当前页
    navLinks.addEventListener('mouseover', (e) => {
      const link = e.target.closest('.nav__link');
      if (link) placeLine(link, true);
    });
    navLinks.addEventListener('mouseleave', () => placeLine(links[current], true));

    // 字体加载完成后宽度会变，重新量一次
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => placeLine(links[activeIndex()], false));
    }
    window.addEventListener('resize', () => placeLine(links[activeIndex()], false));
  }

  /* ---------- 页面转场 ---------- */
  // 点站内链接时整页淡出再跳转；只拦普通左键点击，新窗口/下载/锚点都不动
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;

    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return;

    e.preventDefault();
    if (navLinks) {
      const i = Array.from(navLinks.querySelectorAll('.nav__link')).indexOf(a.closest('.nav__link'));
      if (i >= 0) sessionStorage.setItem('nav-from', String(i));
    }
    document.body.classList.add('is-leaving');
    setTimeout(() => { location.href = url.href; }, 190);
  });

  // 从上一页返回时（bfcache）要把淡出状态摘掉，否则整页是透明的
  window.addEventListener('pageshow', () => document.body.classList.remove('is-leaving'));

  /* ---------- 滚动进入 ---------- */
  let io = null;

  function observeReveal(root) {
    if (!('IntersectionObserver' in window)) {
      (root || document).querySelectorAll('.reveal').forEach((el) => el.classList.add('is-in'));
      return;
    }

    // 兜底：万一观察器没触发，1.6 秒后把视口内的都放出来
    setTimeout(() => {
      document.querySelectorAll('.reveal:not(.is-in)').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('is-in');
      });
    }, 1600);

    if (!io) {
      io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
    }

    (root || document).querySelectorAll('.reveal:not(.is-in)').forEach((el) => {
      if (!el.style.getPropertyValue('--i')) {
        const i = Array.from(el.parentElement.children).indexOf(el);
        el.style.setProperty('--i', String(Math.min(i, 8)));
      }
      io.observe(el);
    });
  }

  /* 给刚渲染出来的内容打上 reveal 标记 */
  function markContent() {
    document.querySelectorAll('[data-slot]').forEach((slot) => {
      Array.from(slot.children).forEach((el, i) => {
        if (el.classList.contains('reveal')) return;
        el.classList.add('reveal');
        el.style.setProperty('--i', String(Math.min(i, 8)));
      });
    });
    observeReveal();
  }

  document.addEventListener('kris:rendered', () => { initPhotos(); markContent(); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => observeReveal());
  } else {
    observeReveal();
  }

  // 没有 IntersectionObserver 或脚本报错时，别让内容一直隐身
  window.addEventListener('error', () => {
    document.documentElement.classList.remove('js');
  });
})();

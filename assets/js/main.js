/* ==========================================================================
   Kris — 交互
   手机菜单、照片墙分栏、照片灯箱。内容由 site.js 渲染，所以照片墙和灯箱
   要等 kris:rendered 之后再初始化。
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- 手机菜单 + 文章下拉 ---------- */
  const nav = document.querySelector('[data-nav]');
  const navToggle = document.querySelector('[data-nav-toggle]');
  const desktopNav = () => window.matchMedia('(min-width: 761px)').matches;

  function closeNav() {
    if (!nav || !navToggle) return;
    nav.classList.remove('nav--open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', '打开菜单');
  }

  function closeDrops(except) {
    document.querySelectorAll('.nav__drop.is-open').forEach((drop) => {
      if (except && drop === except) return;
      drop.classList.remove('is-open');
      const link = drop.querySelector(':scope > .nav__link');
      if (link) link.setAttribute('aria-expanded', 'false');
    });
  }

  document.querySelectorAll('.nav__drop > .nav__link').forEach((link) => {
    link.setAttribute('aria-expanded', 'false');
    link.setAttribute('aria-haspopup', 'true');
  });

  if (nav) {
    nav.addEventListener('click', (e) => {
      const dropLink = e.target.closest('.nav__drop > .nav__link');
      if (dropLink && desktopNav()) {
        const drop = dropLink.closest('.nav__drop');
        // 已展开时再点一次「文章」→ 进入总页；第一次只展开菜单
        if (drop.classList.contains('is-open')) {
          closeDrops();
          return;
        }
        e.preventDefault();
        closeDrops();
        drop.classList.add('is-open');
        dropLink.setAttribute('aria-expanded', 'true');
        return;
      }

      if (e.target.closest('.nav__sub a')) {
        closeDrops();
        closeNav();
        return;
      }

      if (e.target.closest('.nav__link')) closeNav();
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav__drop')) closeDrops();
  });

  if (nav && navToggle) {
    navToggle.addEventListener('click', () => {
      const open = nav.classList.toggle('nav--open');
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
      if (!open) closeDrops();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.nav__drop.is-open')) {
        closeDrops();
        return;
      }
      if (nav.classList.contains('nav--open')) {
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





  /* ---------- 首屏引文视差 ---------- */
  function initHeroParallax() {
    const hero = document.querySelector('.hero');
    const q = hero && hero.querySelector('.q');
    if (!hero || !q) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;

    function run() {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      q.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      if (Math.abs(tx - x) > 0.05 || Math.abs(ty - y) > 0.05) {
        raf = requestAnimationFrame(run);
      } else {
        raf = 0;
      }
    }

    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = hero.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      tx = -dx * 14;
      ty = -dy * 10;
      if (!raf) raf = requestAnimationFrame(run);
    });

    hero.addEventListener('pointerleave', () => {
      tx = 0; ty = 0;
      if (!raf) raf = requestAnimationFrame(run);
    });
  }

  /* ---------- 自定义光标 ---------- */
  // 只在精确指针设备（鼠标）且没开「减少动态效果」时接管
  function initCursor() {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || calm) return;

    const el = document.createElement('div');
    el.className = 'cursor';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span class="cursor__ring"></span><span class="cursor__dot"></span>';
    document.body.appendChild(el);
    document.documentElement.classList.add('has-cursor');

    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let x = tx;
    let y = ty;
    let visible = false;
    let running = true;

    const hot = 'a, button, [role="button"], .sicon, figure[data-src], .nav__toggle, .q__toggle';
    let mx = tx;
    let my = ty;
    let lining = false;
    let lineLink = null;

    function navUsesLine() {
      return navLine && getComputedStyle(navLine).display !== 'none';
    }

    /* 指针落在导航字上，或字与字之间的空隙里：取最近的一项 */
    function linkAt(px, py) {
      if (!navLinks || !links.length || !navUsesLine()) return null;
      const box = navLinks.getBoundingClientRect();
      if (py < box.top - 6 || py > box.bottom + 8 || px < box.left || px > box.right) return null;
      let best = null;
      let bestDist = Infinity;
      links.forEach((a) => {
        const r = a.getBoundingClientRect();
        if (px < r.left - 15 || px > r.right + 15) return;
        const dist = Math.abs(px - (r.left + r.width / 2));
        if (dist < bestDist) { best = a; bestDist = dist; }
      });
      return best;
    }

    function placeOnLink(link) {
      const r = link.getBoundingClientRect();
      lineLink = link;
      lining = true;
      el.classList.add('is-line');
      el.classList.remove('is-hot');
      el.style.setProperty('--line-w', r.width + 'px');
      tx = r.left + r.width / 2;
      ty = r.bottom - 0.5;
    }

    function releaseLine() {
      if (!lining) return;
      lining = false;
      lineLink = null;
      el.classList.remove('is-line');
      tx = mx;
      ty = my;
    }

    function frame() {
      if (!running) return;
      const k = lining ? 0.16 : 0.18;
      x += (tx - x) * k;
      y += (ty - y) * k;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      requestAnimationFrame(frame);
    }

    document.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      mx = e.clientX;
      my = e.clientY;
      const link = linkAt(mx, my);
      if (link) placeOnLink(link);
      else {
        releaseLine();
        tx = mx;
        ty = my;
      }
      if (!visible) {
        x = tx;
        y = ty;
        visible = true;
        el.classList.add('is-on');
      }
    }, { passive: true });

    document.addEventListener('pointerover', (e) => {
      const link = navUsesLine() ? e.target.closest('.nav__link') : null;
      if (link) placeOnLink(link);
      else if (!e.target.closest('.nav__links')) {
        releaseLine();
        el.classList.toggle('is-hot', !!e.target.closest(hot));
      }
      el.style.opacity = e.target.closest('.adm') ? '0' : '';
    });

    window.addEventListener('scroll', () => { if (lineLink) placeOnLink(lineLink); }, { passive: true });
    window.addEventListener('resize', () => { if (lineLink) placeOnLink(lineLink); });

    document.addEventListener('pointerdown', () => el.classList.add('is-down'));
    document.addEventListener('pointerup', () => el.classList.remove('is-down'));

    document.addEventListener('pointerleave', () => {
      releaseLine();
      visible = false;
      el.classList.remove('is-on');
    });

    window.addEventListener('blur', () => {
      visible = false;
      el.classList.remove('is-on');
    });

    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if (running) requestAnimationFrame(frame);
    });

    requestAnimationFrame(frame);
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

    // 有自定义光标时，悬停下划线由墨点变成，这条线留在当前页
    const cursorOwnsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!cursorOwnsHover) {
      navLinks.addEventListener('mouseover', (e) => {
        const link = e.target.closest('.nav__link');
        if (link) placeLine(link, true);
      });
      navLinks.addEventListener('mouseleave', () => placeLine(links[current], true));
    }

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

  /* 给刚渲染出来的内容打上 reveal 标记（页头/筛选条不动画） */
  function markContent() {
    document.querySelectorAll('[data-slot]').forEach((slot) => {
      if (slot.classList.contains('page-head') || slot.matches('.ntags, .page-head')) return;
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
    document.addEventListener('DOMContentLoaded', () => { observeReveal(); initCursor(); initHeroParallax(); });
  } else {
    observeReveal();
    initCursor();
    initHeroParallax();
  }

  // 没有 IntersectionObserver 或脚本报错时，别让内容一直隐身
  window.addEventListener('error', () => {
    document.documentElement.classList.remove('js');
  });
})();

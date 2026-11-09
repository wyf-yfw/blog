/* ==========================================================================
   Kris — 交互
   导航菜单、标签筛选、照片灯箱。没有依赖，没有框架。
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- 0. 照片墙分栏 ---------- */
  // 原生 CSS columns 在图片高矮差得多的时候排不匀，这里按比例高度
  // 把每张图放进当前最矮的一栏。没 JS 时回退到 CSS columns。
  const wall = document.querySelector('[data-masonry]');

  if (wall) {
    const figures = Array.from(wall.querySelectorAll('figure'));

    const layout = () => {
      const w = window.innerWidth;
      const count = w <= 560 ? 2 : w <= 900 ? 2 : 3;
      if (wall.dataset.cols === String(count) && wall.classList.contains('is-laid')) return;

      // 先把图片从栏里拆出来
      const existingCols = Array.from(wall.querySelectorAll('.masonry__col'));
      if (existingCols.length) {
        existingCols.forEach((col) => {
          Array.from(col.children).forEach((fig) => wall.appendChild(fig));
          col.remove();
        });
      }

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
        for (let i = 1; i < count; i++) {
          if (heights[i] < heights[target]) target = i;
        }

        cols[target].appendChild(fig);
        heights[target] += ratio + 0.14; // 0.14 ≈ 图说加间距占的高度比
      });

      cols.forEach((col) => wall.appendChild(col));
      wall.classList.add('is-laid');
      wall.dataset.cols = String(count);
    };

    layout();
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const count = w <= 900 ? 2 : 3;
      if (wall.dataset.cols !== String(count)) layout();
    });
  }

  /* ---------- 1. 手机菜单 ---------- */
  const nav = document.querySelector('[data-nav]');
  const navToggle = document.querySelector('[data-nav-toggle]');

  if (nav && navToggle) {
    navToggle.addEventListener('click', () => {
      const open = nav.classList.toggle('nav--open');
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
    });

    nav.addEventListener('click', (e) => {
      if (e.target.closest('.nav__link')) {
        nav.classList.remove('nav--open');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.setAttribute('aria-label', '打开菜单');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('nav--open')) {
        nav.classList.remove('nav--open');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.focus();
      }
    });
  }

  /* ---------- 2. 标签筛选 ---------- */
  document.querySelectorAll('[data-filter]').forEach((bar) => {
    const buttons = Array.from(bar.querySelectorAll('[data-filter-value]'));
    const scope = bar.parentElement;
    const items = Array.from(scope.querySelectorAll('[data-tag]'));
    const groups = Array.from(scope.querySelectorAll('[data-year-group]'));

    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter-value]');
      if (!btn) return;

      const value = btn.dataset.filterValue;

      buttons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });

      items.forEach((item) => {
        const tags = (item.dataset.tag || '').split(/\s+/);
        const show = value === 'all' || tags.includes(value);
        item.classList.toggle('hidden', !show);
      });

      // 年份分组里没有可见条目时，整组收起（列表页用）
      groups.forEach((group) => {
        const anyVisible = group.querySelector('[data-tag]:not(.hidden)');
        group.classList.toggle('hidden', !anyVisible);
      });
    });
  });

  /* ---------- 3. 照片灯箱 ---------- */
  const lb = document.querySelector('[data-lb]');

  if (lb) {
    const set = Array.from(document.querySelectorAll('[data-lightbox-set] figure'));
    const imgEl = lb.querySelector('[data-lb-img]');
    const capEl = lb.querySelector('[data-lb-cap]');
    const btnClose = lb.querySelector('[data-lb-close]');
    const btnPrev = lb.querySelector('[data-lb-prev]');
    const btnNext = lb.querySelector('[data-lb-next]');

    const shots = set.map((fig) => ({
      src: fig.dataset.src,
      cap: fig.dataset.cap || '',
      alt: fig.querySelector('img') ? fig.querySelector('img').alt : ''
    }));

    let index = 0;
    let lastFocus = null;

    const render = () => {
      const shot = shots[index];
      if (!shot) return;
      imgEl.src = shot.src;
      imgEl.alt = shot.alt;
      capEl.textContent = shot.cap;
    };

    const open = (i) => {
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
      index = (index + step + shots.length) % shots.length;
      render();
    };

    set.forEach((fig, i) => {
      fig.addEventListener('click', () => open(i));
      fig.setAttribute('tabindex', '0');
      fig.setAttribute('role', 'button');
      fig.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(i);
        }
      });
    });

    btnClose.addEventListener('click', close);
    btnPrev.addEventListener('click', () => go(-1));
    btnNext.addEventListener('click', () => go(1));

    lb.addEventListener('click', (e) => {
      if (e.target === lb) close();
    });

    document.addEventListener('keydown', (e) => {
      if (lb.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    });
  }
})();

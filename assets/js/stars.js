/* 推荐页：只读 /api/stars（每天由 Cron 同步进 D1） */
(function () {
  "use strict";

  const box = document.querySelector("[data-stars]");
  const emptyEl = document.querySelector("[data-stars-empty]");
  const footEl = document.querySelector("[data-stars-foot]");
  const filterEl = document.querySelector("[data-star-filter]");
  if (!box) return;

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const when = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
    }).format(d).replace(/\//g, "-");
  };

  let all = [];
  let current = "全部";

  function row(item) {
    const meta = [];
    if (item.language) meta.push(item.language);
    if (item.stars) meta.push("★ " + item.stars);
    return '<a class="star" href="' + esc(item.url) + '" target="_blank" rel="noopener">'
      + '<span class="star__repo">' + esc(item.repo) + "</span>"
      + (item.description ? '<span class="star__desc">' + esc(item.description) + "</span>" : "")
      + (meta.length ? '<span class="star__meta">' + esc(meta.join(" · ")) + "</span>" : "")
      + "</a>";
  }

  function render() {
    const list = current === "全部" ? all : all.filter((i) => (i.language || "其他") === current);
    box.innerHTML = list.map(row).join("");
    if (emptyEl) emptyEl.hidden = all.length > 0;
    box.hidden = all.length === 0;
  }

  function buildFilter() {
    if (!filterEl) return;
    const langs = [];
    all.forEach((i) => {
      const key = i.language || "其他";
      if (!langs.includes(key)) langs.push(key);
    });
    if (langs.length < 2) return;
    const buttons = ["全部"].concat(langs);
    filterEl.innerHTML = buttons.map((name) =>
      '<button type="button" class="star-chip' + (name === current ? " is-active" : "") + '" data-lang="' + esc(name) + '">' + esc(name) + "</button>"
    ).join("");
    filterEl.hidden = false;
    filterEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-lang]");
      if (!btn) return;
      current = btn.dataset.lang;
      filterEl.querySelectorAll(".star-chip").forEach((b) => b.classList.toggle("is-active", b === btn));
      render();
    });
  }

  async function start() {
    try {
      const res = await fetch("/api/stars", { cache: "no-store" });
      const data = res.ok ? await res.json() : {};
      all = Array.isArray(data.items) ? data.items : [];
      if (footEl && all.length) {
        const bits = ["同步于 " + when(data.syncedAt), all.length + " 个"];
        if (data.ok === false && data.message) bits.push(data.message);
        footEl.textContent = bits.join(" · ");
        footEl.hidden = false;
      }
      buildFilter();
      render();
    } catch (e) {
      if (emptyEl) emptyEl.hidden = false;
    }
    document.dispatchEvent(new CustomEvent("kris:rendered", { detail: { stars: all } }));
  }

  start();
})();

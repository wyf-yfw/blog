/* 友链页：公开的是已同意的名单，申请先送到后台 */
(function () {
  "use strict";

  const box = document.querySelector("[data-links]");
  const emptyEl = document.querySelector("[data-links-empty]");
  const form = document.querySelector("[data-link-form]");
  const panel = document.querySelector("[data-link-panel]");
  const openBtn = document.querySelector("[data-link-open]");
  const closeBtn = document.querySelector("[data-link-close]");
  const statusEl = document.querySelector("[data-link-status]");
  if (!box) return;

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  function hrefOf(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      return parsed.href;
    } catch (e) {
      return "";
    }
  }

  function row(item) {
    const href = hrefOf(item.url);
    if (!href || !item.name) return "";
    return '<a class="friend" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">'
      + '<span class="friend__name">' + esc(item.name) + "</span>"
      + (item.note ? '<span class="friend__note">' + esc(item.note) + "</span>" : "")
      + "</a>";
  }

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.dataset.kind = kind || "";
  }

  function showForm(open) {
    if (!panel || !openBtn) return;
    panel.hidden = !open;
    openBtn.hidden = open;
    openBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      setStatus("");
      const name = form && form.querySelector('[name="name"]');
      if (name) name.focus();
    }
  }

  if (openBtn) openBtn.addEventListener("click", function () { showForm(true); });
  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      if (form) form.reset();
      showForm(false);
      setStatus("");
    });
  }

  async function load() {
    try {
      const res = await fetch("/api/links", { cache: "no-store" });
      const data = res.ok ? await res.json() : null;
      if (!data) throw new Error("bad");
      const html = (Array.isArray(data.items) ? data.items : []).map(row).join("");
      box.innerHTML = html;
      const has = html.length > 0;
      box.hidden = !has;
      if (emptyEl) emptyEl.hidden = has;
    } catch (e) {
      box.hidden = true;
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = "暂时读不到友链。";
      }
    }
  }

  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const btn = form.querySelector('[type="submit"]');
      const fd = new FormData(form);
      const payload = {
        name: String(fd.get("name") || "").trim(),
        url: String(fd.get("url") || "").trim(),
        note: String(fd.get("note") || "").trim(),
        "bot-field": String(fd.get("bot-field") || "")
      };
      if (btn) {
        btn.disabled = true;
        btn.textContent = "送出中…";
      }
      setStatus("正在送出…");
      try {
        const res = await fetch("/api/links", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(data.hint || "没有送出");
        form.reset();
        showForm(false);
        setStatus("已经收到。我同意之后会出现在上面。", "ok");
      } catch (err) {
        setStatus(err.message, "err");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "提交申请";
        }
      }
    });
  }

  load();
})();

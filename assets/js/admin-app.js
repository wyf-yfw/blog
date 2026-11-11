(function () {
  "use strict";

  const CATS = ["学记", "省察", "所见", "存档"];
  const loginForm = document.querySelector("[data-login]");
  const loginStatus = document.querySelector("[data-login-status]");
  let draftTimer = 0;
  let draftFlush = null;

  const desk = document.querySelector("[data-desk]");
  const deskStatus = document.querySelector("[data-desk-status]");
  const aboutForm = document.querySelector("[data-about]");

  function showLogin(message) {
    desk.hidden = true;
    closeSheet();
    loginForm.hidden = false;
    loginStatus.textContent = message || "";
  }

  function showDesk() {
    loginForm.hidden = true;
    desk.hidden = false;
  }

  async function send(path, options) {
    const res = await fetch(path, Object.assign({ credentials: "same-origin" }, options || {}));
    const data = await res.json().catch(function () { return {}; });
    if (res.status === 401 && path !== "/api/admin/login") {
      showLogin("先登录");
      throw new Error("先登录");
    }
    if (!res.ok) throw new Error(data.hint || "没有成功");
    return data;
  }

  function splitTags(value) {
    return String(value || "").split(/[,，\s]+/).map(function (t) { return t.trim(); }).filter(Boolean);
  }

  function field(label, html) {
    return "<label>" + label + html + "</label>";
  }

  function todayYmd() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  }

  function applyDate(form, item) {
    form.date.value = item && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : todayYmd();
  }

  async function prepareImage(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    const type = /image\/(png|webp|gif)/.test(file.type) ? file.type : "image/jpeg";
    const blob = await new Promise(function (resolve) { canvas.toBlob(resolve, type, 0.86); });
    return { blob: blob, width: width, height: height, type: type };
  }

  function sizeChunk(chunk) {
    chunk.style.height = "auto";
    chunk.style.height = Math.max(chunk.scrollHeight, 28) + "px";
  }

  function makeChunk(value) {
    const chunk = document.createElement("textarea");
    chunk.className = "desk__chunk";
    chunk.rows = 1;
    chunk.value = value;
    chunk.addEventListener("input", function () { sizeChunk(chunk); });
    chunk.addEventListener("keydown", function (e) {
      if ((e.key !== "Backspace" && e.key !== "Delete") || chunk.selectionStart !== chunk.selectionEnd) return;
      if (e.key === "Backspace" && chunk.selectionStart === 0) {
        const pic = chunk.previousElementSibling;
        const prev = pic && pic.previousElementSibling;
        if (!pic || !pic.dataset.pic || !prev || prev.nodeName !== "TEXTAREA") return;
        e.preventDefault();
        const pos = prev.value.length;
        prev.value += chunk.value;
        sizeChunk(prev);
        pic.remove();
        chunk.remove();
        prev.focus();
        prev.selectionStart = prev.selectionEnd = pos;
        prev.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (e.key === "Delete" && chunk.selectionStart === chunk.value.length) {
        const pic = chunk.nextElementSibling;
        const next = pic && pic.nextElementSibling;
        if (!pic || !pic.dataset.pic || !next || next.nodeName !== "TEXTAREA") return;
        e.preventDefault();
        const pos = chunk.value.length;
        chunk.value += next.value;
        sizeChunk(chunk);
        pic.remove();
        next.remove();
        chunk.selectionStart = chunk.selectionEnd = pos;
        chunk.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    return chunk;
  }

  function makePic(src, alt) {
    const pic = document.createElement("figure");
    pic.className = "desk__pic";
    pic.dataset.pic = "1";
    const img = document.createElement("img");
    img.setAttribute("src", src);
    img.alt = alt || "";
    pic.appendChild(img);
    return pic;
  }

  function mountWriter(source) {
    source.hidden = true;
    source.removeAttribute("required");
    const writer = document.createElement("div");
    writer.className = "desk__writer";
    const text = source.value || "";
    const re = /!\[([^\]]*)\]\(((?:\/)?assets\/[^)\s]+|\/media\/[^)\s]+|https?:\/\/[^)\s]+)\)/gi;
    let last = 0;
    let match;
    while ((match = re.exec(text))) {
      writer.appendChild(makeChunk(text.slice(last, match.index)));
      writer.appendChild(makePic(match[2], match[1]));
      last = match.index + match[0].length;
    }
    writer.appendChild(makeChunk(text.slice(last)));
    source.after(writer);
    writer.querySelectorAll("textarea").forEach(sizeChunk);
    requestAnimationFrame(function () {
      writer.querySelectorAll("textarea").forEach(sizeChunk);
    });
    const label = source.closest("label");
    if (label) {
      label.addEventListener("mousedown", function (e) {
        if (e.target !== label) return;
        e.preventDefault();
        const chunk = writer.querySelector("textarea");
        if (chunk) chunk.focus();
      });
    }
    return {
      element: writer,
      read: function () {
        // 前台渲染器要求图片独占一段（按空行切块，切出来的整块只有一个 ![]()），
        // 所以这里拼装时给每张图前后补空行，最后把连续空行压成一个。
        let out = "";
        writer.childNodes.forEach(function (child) {
          if (child.nodeName === "TEXTAREA") {
            out += child.value;
          }
          if (child.dataset && child.dataset.pic) {
            const img = child.querySelector("img");
            const raw = img.getAttribute("src") || "";
            let src = raw;
            try {
              const url = new URL(raw, location.origin);
              if (url.origin === location.origin) src = url.pathname + url.search;
            } catch (err) { /* 保持原地址 */ }
            out = out.replace(/[ \t]*\n*$/, "");
            if (out) out += "\n\n";
            out += "![" + (img.getAttribute("alt") || "") + "](" + src + ")\n\n";
          }
        });
        return out.replace(/\n{3,}/g, "\n\n").trim();
      },
      insert: function (src, alt) {
        const current = document.activeElement;
        const chunk = current && current.classList.contains("desk__chunk") && writer.contains(current)
          ? current
          : writer.querySelector("textarea:last-of-type");
        const atEnd = document.activeElement !== chunk;
        const start = atEnd ? chunk.value.length : chunk.selectionStart;
        const end = atEnd ? chunk.value.length : chunk.selectionEnd;
        const after = makeChunk(chunk.value.slice(end).replace(/^\n+/, ""));
        chunk.value = chunk.value.slice(0, start).replace(/\n+$/, "");
        sizeChunk(chunk);
        chunk.after(makePic(src, alt || "说明"), after);
        sizeChunk(after);
        after.focus();
        writer.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
  }

  function bindImageInput(writer) {
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "desk__btn";
    pick.textContent = "插入图片";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.hidden = true;
    pick.addEventListener("click", function () { input.click(); });

    async function upload(file) {
      const prepared = await prepareImage(file);
      const form = new FormData();
      form.set("file", new File([prepared.blob], "image", { type: prepared.type }));
      form.set("width", String(prepared.width));
      form.set("height", String(prepared.height));
      const saved = await send("/api/admin/media", { method: "POST", body: form });
      writer.insert(saved.url, "说明");
    }

    function take(file, event) {
      if (!file || !file.type.startsWith("image/")) return;
      event.preventDefault();
      upload(file).catch(function (err) { deskStatus.textContent = err.message; });
    }

    input.addEventListener("change", function () {
      if (input.files[0]) upload(input.files[0]).catch(function (err) { deskStatus.textContent = err.message; });
    });
    writer.element.addEventListener("paste", function (e) {
      const file = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0];
      take(file, e);
    });
    writer.element.addEventListener("dragover", function (e) {
      if (!e.dataTransfer) return;
      e.preventDefault();
      writer.element.classList.add("is-drop");
    });
    writer.element.addEventListener("dragleave", function () {
      writer.element.classList.remove("is-drop");
    });
    writer.element.addEventListener("drop", function (e) {
      writer.element.classList.remove("is-drop");
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      const chunk = e.target.closest && e.target.closest("textarea");
      if (chunk) chunk.focus();
      take(file, e);
    });
    return [pick, input];
  }

  function closeSheet() {
    clearInterval(draftTimer);
    draftTimer = 0;
    const flush = draftFlush;
    draftFlush = null;
    if (typeof flush === "function") flush();
    const sheet = document.querySelector("[data-sheet]");
    if (sheet) {
      sheet.hidden = true;
      sheet.replaceChildren();
    }
    document.body.classList.remove("is-sheet");
  }

  async function openSheet(item) {
    const sheet = document.querySelector("[data-sheet]");
    const draftKey = item ? item.id : "new";
    let draft = null;
    try {
      const all = await send("/api/admin/drafts");
      draft = (all.items || []).find(function (d) { return d.key === draftKey; }) || null;
    } catch (err) { /* 取不到草稿不影响写作 */ }

    desk.hidden = true;
    sheet.hidden = false;
    document.body.classList.add("is-sheet");
    const form = document.createElement("form");
    form.className = "sheet__form";
    form.innerHTML = '<div class="sheet__bar"><button type="button" class="desk__btn" data-back>返回</button><p class="desk__hint" data-pace></p><p class="desk__hint desk__draft" data-draft></p><div class="sheet__bar-side"></div></div>'
      + '<input class="sheet__title" name="title" placeholder="标题" required>'
      + '<div class="sheet__meta">'
      + '<label>日期 <input name="date" type="date" required></label>'
      + '<label>类别 <select name="category">' + CATS.map(function (c) {
        return '<option value="' + c + '">' + c + "</option>";
      }).join("") + "</select></label>"
      + '<label>标签 <input name="tags" placeholder="用空格分开"></label>'
      + '<label>摘要 <input name="excerpt" maxlength="200" placeholder="可以空着"></label>'
      + "</div>"
      + '<textarea name="body" hidden></textarea>';
    const seed = draft || item || null;
    if (draft) {
      form.title.value = draft.title || "";
      form.excerpt.value = draft.excerpt || "";
      form.category.value = draft.category || "学记";
      form.tags.value = (draft.tags || []).join(" ");
      form.body.value = draft.body || "";
    } else if (item) {
      form.title.value = item.title || "";
      form.excerpt.value = item.excerpt || "";
      form.category.value = item.category || "学记";
      form.tags.value = (item.tags || []).join(" ");
      form.body.value = item.body || "";
    }
    applyDate(form, seed);
    const source = form.querySelector("textarea");
    const writer = mountWriter(source);
    writer.element.classList.add("sheet__page");
    const first = writer.element.querySelector("textarea");
    if (first && !source.value) first.placeholder = "从这里写起";
    writer.element.addEventListener("mousedown", function (e) {
      if (e.target !== writer.element) return;
      const chunk = writer.element.querySelector("textarea:last-of-type");
      if (!chunk) return;
      e.preventDefault();
      chunk.focus();
      chunk.selectionStart = chunk.selectionEnd = chunk.value.length;
    });
    const pace = form.querySelector("[data-pace]");
    const showPace = function () {
      const plain = writer.read().replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\s/g, "");
      const count = Array.from(plain).length;
      const minutes = count ? Math.min(99, Math.max(1, Math.ceil(count / 400))) : 0;
      pace.textContent = minutes ? "阅读约 " + minutes + " 分钟" : "";
    };
    writer.element.addEventListener("input", showPace);
    showPace();
    const tools = bindImageInput(writer);
    const save = document.createElement("button");
    save.className = "gb__submit";
    save.type = "submit";
    save.textContent = "保存";
    form.querySelector(".sheet__bar-side").append(tools[0], tools[1], save);
    function payload() {
      source.value = writer.read();
      return {
        date: form.date.value,
        title: form.title.value,
        excerpt: form.excerpt.value,
        category: form.category.value,
        tags: splitTags(form.tags.value),
        body: form.body.value
      };
    }
    const started = JSON.stringify(payload());

    /* ---------- 草稿：每 30 秒存一次，返回/刷新前再补存一次 ---------- */
    const draftHint = form.querySelector("[data-draft]");
    let dirty = false;

    const clock = function () {
      return new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false
      }).format(new Date());
    };

    const saveDraft = function (silent) {
      const data = payload();
      if (!dirty && !silent) return Promise.resolve();
      return send("/api/admin/drafts/" + encodeURIComponent(draftKey), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
        keepalive: true
      }).then(function () {
        dirty = false;
        if (draftHint) draftHint.textContent = "草稿 " + clock();
      }).catch(function () {
        if (draftHint) draftHint.textContent = "草稿没存上";
      });
    };
    draftFlush = function () { saveDraft(true); };

    const markDirty = function () { dirty = true; };
    writer.element.addEventListener("input", markDirty);
    ["input", "change"].forEach(function (ev) { form.addEventListener(ev, markDirty); });

    clearInterval(draftTimer);
    draftTimer = setInterval(saveDraft, 30000);

    // 切走标签页/最小化时补存一次，比等 30 秒可靠
    const onHide = function () { if (document.hidden) saveDraft(true); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", function () { saveDraft(true); }, { once: true });

    if (draft && draftHint) {
      draftHint.textContent = "已恢复草稿";
      const drop = document.createElement("button");
      drop.type = "button";
      drop.className = "desk__btn";
      drop.textContent = "丢弃草稿";
      drop.addEventListener("click", async function () {
        if (!confirm("丢弃这份草稿？")) return;
        await send("/api/admin/drafts/" + encodeURIComponent(draftKey), { method: "DELETE" });
        closeSheet();
        showDesk();
        await load();
      });
      form.querySelector(".sheet__bar-side").prepend(drop);
    }
    form.querySelector("[data-back]").addEventListener("click", function () {
      if (JSON.stringify(payload()) !== started && !confirm("离开这页？写好的内容会丢掉。")) return;
      closeSheet();
      showDesk();
    });
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const body = payload();
      try {
        await send(item ? "/api/admin/articles/" + item.id : "/api/admin/articles", {
          method: item ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        });
        dirty = false;
        clearInterval(draftTimer);
        draftTimer = 0;
        draftFlush = null;
        await send("/api/admin/drafts/" + encodeURIComponent(draftKey), { method: "DELETE" }).catch(function () {});
        closeSheet();
        showDesk();
        deskStatus.textContent = "已经生效";
        await load();
      } catch (err) {
        pace.textContent = err.message;
      }
    });
    sheet.replaceChildren(form);
    (item ? first : form.title).focus();
  }

  function openEditor(section, item) {
    const host = section.querySelector("[data-editor]");
    const form = document.createElement("form");
    form.className = "adm__form";
    form.innerHTML = field("日期", '<input name="date" type="date" required>')
      + field("正文", '<textarea name="text" rows="8" required></textarea>')
      + field("标签", '<input name="tags">');
    if (item) {
      form.text.value = item.text || "";
      form.tags.value = (item.tags || []).join(" ");
    }
    applyDate(form, item);
    const save = document.createElement("button");
    save.className = "gb__submit";
    save.type = "submit";
    save.textContent = "保存";
    const cancel = textButton("取消");
    cancel.addEventListener("click", function () { host.replaceChildren(); });
    const source = form.querySelector("textarea");
    const writer = mountWriter(source);
    const tools = bindImageInput(writer);
    const actions = document.createElement("div");
    actions.className = "desk__form-actions";
    actions.append(tools[0], tools[1], cancel, save);
    form.appendChild(actions);
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      source.value = writer.read();
      const body = { date: form.date.value, text: form.text.value, tags: splitTags(form.tags.value) };
      try {
        await send(item ? "/api/admin/notes/" + item.id : "/api/admin/notes", {
          method: item ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        });
        deskStatus.textContent = "已经生效";
        await load();
      } catch (err) {
        deskStatus.textContent = err.message;
      }
    });
    host.replaceChildren(form);
    host.scrollIntoView({ block: "nearest" });
  }

  function textButton(label, danger) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = danger ? "desk__btn desk__btn--danger" : "desk__btn";
    button.textContent = label;
    return button;
  }

  function whenOf(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!match) return value || "";
    const day = match[1] + "." + match[2] + "." + match[3];
    return match[4] ? day + " " + match[4] + ":" + match[5] : day;
  }

  function makeRow(whenText, mainText) {
    const el = document.createElement("article");
    el.className = "desk__row";
    const when = document.createElement("time");
    when.className = "desk__when";
    when.textContent = whenText || "";
    const main = document.createElement("p");
    main.className = "desk__text";
    main.textContent = String(mainText || "").replace(/!\[[^\]]*\]\([^)\s]+\)/g, " ").replace(/\s+/g, " ").trim();
    const ops = document.createElement("div");
    ops.className = "desk__ops";
    el.append(when, main, ops);
    return { el: el, ops: ops };
  }

  function renderRows(section, title, rows) {
    section.className = "desk__sec";
    const head = document.createElement("div");
    head.className = "desk__head";
    const add = textButton("新建");
    head.appendChild(add);
    const list = document.createElement("div");
    list.className = "desk__list";
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "desk__empty";
      empty.textContent = "还没有" + title + "。";
      list.appendChild(empty);
    } else {
      rows.forEach(function (row) { list.appendChild(row); });
    }
    const host = document.createElement("div");
    host.dataset.editor = "";
    section.replaceChildren(head, host, list);
    return add;
  }

  function renderArticles(items, drafts) {
    const section = document.querySelector("[data-articles]");
    const draftRows = (drafts || []).map(function (d) {
      const label = d.title ? "草稿 · " + d.title : "草稿 · 还没起标题";
      const made = makeRow(whenOf(d.updatedAt.slice(0, 10)), label);
      const go = textButton("继续写");
      go.addEventListener("click", function () {
        const target = d.key === "new" ? null : items.find(function (a) { return a.id === d.key; }) || null;
        openSheet(target);
      });
      const drop = textButton("丢弃", true);
      drop.addEventListener("click", async function () {
        if (!confirm("丢弃这份草稿？")) return;
        await send("/api/admin/drafts/" + encodeURIComponent(d.key), { method: "DELETE" });
        await load();
      });
      made.ops.append(go, drop);
      return made.el;
    });
    const rows = items.map(function (item) {
      const made = makeRow(whenOf(item.date), item.title);
      const edit = textButton("编辑");
      edit.addEventListener("click", function () { openSheet(item); });
      const del = textButton("删除", true);
      del.addEventListener("click", async function () {
        if (!confirm("删除「" + item.title + "」？")) return;
        await send("/api/admin/articles/" + item.id, { method: "DELETE" });
        deskStatus.textContent = "已经生效";
        await load();
      });
      made.ops.append(edit, del);
      return made.el;
    });
    const add = renderRows(section, "文章", draftRows.concat(rows));
    add.addEventListener("click", function () { openSheet(null); });
  }

  function renderNotes(items) {
    const section = document.querySelector("[data-notes]");
    const rows = items.map(function (item) {
      const made = makeRow(whenOf(item.date), item.text);
      const edit = textButton("编辑");
      edit.addEventListener("click", function () { openEditor(section, item); });
      const del = textButton("删除", true);
      del.addEventListener("click", async function () {
        if (!confirm("删除这则手记？")) return;
        await send("/api/admin/notes/" + item.id, { method: "DELETE" });
        deskStatus.textContent = "已经生效";
        await load();
      });
      made.ops.append(edit, del);
      return made.el;
    });
    const add = renderRows(section, "手记", rows);
    add.addEventListener("click", function () { openEditor(section, null); });
  }

  function renderPlain(section, title, items, fields, onDelete) {
    section.className = "desk__sec";
    const list = document.createElement("div");
    list.className = "desk__list";
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "desk__empty";
      empty.textContent = "还没有" + title + "。";
      list.appendChild(empty);
    }
    items.forEach(function (item) {
      const part = fields(item);
      const made = makeRow(part.when, part.text);
      const del = textButton("删除", true);
      del.addEventListener("click", function () { onDelete(item); });
      made.ops.appendChild(del);
      list.appendChild(made.el);
    });
    section.replaceChildren(list);
  }

  let currentTab = "articles";

  function showTab(name) {
    currentTab = name;
    document.querySelectorAll("[data-panel]").forEach(function (panel) {
      panel.hidden = panel.dataset.panel !== name;
    });
    document.querySelectorAll("[data-tab]").forEach(function (tab) {
      tab.setAttribute("aria-selected", tab.dataset.tab === name ? "true" : "false");
    });
    if (name === "quota" && !document.querySelector("[data-quota] .quota")) loadUsage();
  }

  function fmtAmount(n, unit) {
    if (n == null) return "—";
    if (unit === "B") {
      const v = Number(n) || 0;
      if (v < 1000) return new Intl.NumberFormat("zh-CN").format(v) + " B";
      if (v < 1e6) return (v / 1e3).toFixed(1) + " KB";
      if (v < 1e9) return (v / 1e6).toFixed(1) + " MB";
      return (v / 1e9).toFixed(2) + " GB";
    }
    const text = new Intl.NumberFormat("zh-CN").format(n);
    return unit ? text + " " + unit : text;
  }

  function fmtClock(iso) {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(new Date(iso));
  }

  function renderQuota(data) {
    const section = document.querySelector("[data-quota]");
    section.className = "desk__sec";
    const tools = document.createElement("div");
    tools.className = "quota__tools";
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "desk__btn";
    refresh.textContent = "刷新";
    refresh.addEventListener("click", function () { loadUsage(true); });
    tools.appendChild(refresh);
    const parts = [tools];
    if (data.notice) {
      const notice = document.createElement("p");
      notice.className = "desk__hint";
      notice.textContent = data.notice;
      parts.push(notice);
    }
    if (data.checkedAt) {
      const stamp = document.createElement("p");
      stamp.className = "desk__hint";
      stamp.textContent = "读于 " + fmtClock(data.checkedAt);
      parts.push(stamp);
    }
    (data.groups || []).forEach(function (group) {
      const head = document.createElement("div");
      head.className = "quota__head";
      const title = document.createElement("h2");
      title.textContent = group.title;
      head.appendChild(title);
      parts.push(head);
      if (group.note) {
        const note = document.createElement("p");
        note.className = "quota__note";
        note.textContent = group.note;
        parts.push(note);
      }
      const list = document.createElement("div");
      list.className = "quota";
      (group.items || []).forEach(function (item) {
        const row = document.createElement("article");
        row.className = "quota__item";
        const top = document.createElement("div");
        top.className = "quota__top";
        const name = document.createElement("span");
        name.className = "quota__name";
        name.textContent = item.name;
        const meta = document.createElement("span");
        meta.className = "quota__meta";
        if (item.kind === "included") meta.textContent = "含在免费方案里";
        else if (item.kind === "cap" || item.used == null) meta.textContent = "上限 " + fmtAmount(item.limit, item.unit);
        else meta.textContent = fmtAmount(item.used, item.unit) + " / " + fmtAmount(item.limit, item.unit);
        top.append(name, meta);
        row.appendChild(top);
        const bits = [];
        if (item.kind === "meter" && item.remaining != null) bits.push("剩余 " + fmtAmount(item.remaining, item.unit));
        if (item.resetsAt) bits.push(fmtClock(item.resetsAt) + " 清零");
        else if (item.kind === "meter") bits.push("不会按周期清零");
        if (bits.length) {
          const sub = document.createElement("p");
          sub.className = "quota__sub";
          sub.textContent = bits.join(" · ");
          row.appendChild(sub);
        }
        if (item.kind === "meter" && item.used != null && item.limit) {
          const bar = document.createElement("div");
          bar.className = "quota__bar" + (item.used / item.limit >= 0.8 ? " is-hot" : "");
          const fill = document.createElement("span");
          fill.style.width = Math.min(100, item.used / item.limit * 100) + "%";
          bar.appendChild(fill);
          row.appendChild(bar);
        }
        if (item.detail) {
          const detail = document.createElement("p");
          detail.className = "quota__detail";
          detail.textContent = item.detail;
          row.appendChild(detail);
        }
        list.appendChild(row);
      });
      parts.push(list);
    });
    section.replaceChildren.apply(section, parts);
  }

  let quotaFlight = null;

  function loadUsage(force) {
    const section = document.querySelector("[data-quota]");
    if (!force && section.querySelector(".quota")) return Promise.resolve();
    if (quotaFlight) return quotaFlight;
    section.className = "desk__sec";
    const waiting = document.createElement("p");
    waiting.className = "desk__hint";
    waiting.textContent = "正在读取额度…";
    section.replaceChildren(waiting);
    quotaFlight = send("/api/admin/usage").then(function (data) {
      renderQuota(data);
    }).catch(function (err) {
      const hint = document.createElement("p");
      hint.className = "desk__hint";
      hint.textContent = err.message;
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "desk__btn";
      retry.textContent = "再试一次";
      retry.addEventListener("click", function () { loadUsage(true); });
      section.replaceChildren(hint, retry);
    }).finally(function () {
      quotaFlight = null;
    });
    return quotaFlight;
  }

  document.querySelectorAll("[data-tab]").forEach(function (tab) {
    tab.addEventListener("click", function () { showTab(tab.dataset.tab); });
  });

  function renderViews(site) {
    const section = document.querySelector("[data-views]");
    section.className = "desk__sec";
    const total = document.createElement("p");
    total.className = "desk__stat";
    total.textContent = (Math.max(0, Number(site.views) || 0)) + " 次浏览";
    const hint = document.createElement("p");
    hint.className = "desk__hint";
    hint.textContent = "同一台设备只算一次。";
    const list = document.createElement("div");
    list.className = "desk__list";
    const articles = (site.articles || []).slice().sort(function (a, b) {
      return (Number(b.views) || 0) - (Number(a.views) || 0) || String(b.date || "").localeCompare(String(a.date || ""));
    });
    if (!articles.length) {
      const empty = document.createElement("p");
      empty.className = "desk__empty";
      empty.textContent = "还没有文章。";
      list.appendChild(empty);
    } else {
      articles.forEach(function (item) {
        list.appendChild(makeRow(String(Math.max(0, Number(item.views) || 0)), item.title).el);
      });
    }
    section.replaceChildren(total, hint, list);
  }

  async function load() {
    const site = await send("/api/site");
    const book = await send("/api/guestbook");
    const drafts = await send("/api/admin/drafts").catch(function () { return { items: [] }; });
    renderArticles(site.articles || [], drafts.items || []);
    renderNotes(site.notes || []);
    aboutForm.paragraphs.value = ((site.about && site.about.paragraphs) || []).join("\n\n");
    renderPlain(document.querySelector("[data-timeline]"), "时间线", site.timeline || [], function (item) {
      return { when: whenOf(item.date), text: item.text };
    }, async function (item) {
      await send("/api/admin/timeline/" + item.id, { method: "DELETE" });
      deskStatus.textContent = "已经生效";
      await load();
    });
    renderPlain(document.querySelector("[data-guestbook]"), "留言", book.items || [], function (item) {
      return { when: item.name, text: item.message };
    }, async function (item) {
      await send("/api/admin/guestbook/" + item.id, { method: "DELETE" });
      deskStatus.textContent = "已经生效";
      await load();
    });
    renderViews(site);
    showTab(currentTab);
  }

  aboutForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const paragraphs = aboutForm.paragraphs.value.split(/\n{2,}/).map(function (p) {
      return p.trim();
    }).filter(Boolean);
    try {
      await send("/api/admin/about", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paragraphs: paragraphs })
      });
      deskStatus.textContent = "已经生效";
      await load();
    } catch (err) {
      deskStatus.textContent = err.message;
    }
  });

  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      await send("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: new FormData(loginForm).get("username"),
          password: new FormData(loginForm).get("password")
        })
      });
      loginForm.password.value = "";
      showDesk();
      await load();
    } catch (err) {
      loginStatus.textContent = err.message;
    }
  });

  document.querySelector("[data-logout]").addEventListener("click", async function () {
    await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
    showLogin("");
  });

  fetch("/api/admin/session", { credentials: "same-origin" }).then(function (res) {
    if (!res.ok) {
      showLogin("");
      return;
    }
    showDesk();
    return load();
  }).catch(function () { showLogin("暂时连不上后台"); });
})();

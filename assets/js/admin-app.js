(function () {
  "use strict";

  const CATS = ["学记", "省察", "所见", "存档"];
  const loginForm = document.querySelector("[data-login]");
  const loginStatus = document.querySelector("[data-login-status]");
  const desk = document.querySelector("[data-desk]");
  const deskStatus = document.querySelector("[data-desk-status]");
  const aboutForm = document.querySelector("[data-about]");

  function showLogin(message) {
    desk.hidden = true;
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

  function insertAtCursor(textarea, snippet) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = textarea.value.slice(0, start) + snippet + textarea.value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + snippet.length;
  }

  function bindImageInput(textarea) {
    const pick = document.createElement("button");
    pick.type = "button";
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
      insertAtCursor(textarea, "![说明](" + saved.url + ")");
    }

    input.addEventListener("change", function () {
      if (input.files[0]) upload(input.files[0]).catch(function (err) { deskStatus.textContent = err.message; });
    });
    textarea.addEventListener("paste", function (e) {
      const file = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0];
      if (!file || !file.type.startsWith("image/")) return;
      e.preventDefault();
      upload(file).catch(function (err) { deskStatus.textContent = err.message; });
    });
    textarea.addEventListener("drop", function (e) {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file || !file.type.startsWith("image/")) return;
      e.preventDefault();
      upload(file).catch(function (err) { deskStatus.textContent = err.message; });
    });
    return [pick, input];
  }

  function openEditor(section, kind, item) {
    const host = section.querySelector("[data-editor]");
    const form = document.createElement("form");
    form.className = "adm__form";
    if (kind === "article") {
      form.innerHTML = field("日期", '<input name="date">')
        + field("标题", '<input name="title" required>')
        + field("摘要", '<input name="excerpt" maxlength="200">')
        + field("类别", '<select name="category">' + CATS.map(function (c) {
          return '<option value="' + c + '">' + c + "</option>";
        }).join("") + "</select>")
        + field("标签", '<input name="tags">')
        + field("阅读分钟", '<input name="minutes" type="number" min="1" max="99">')
        + field("正文", '<textarea name="body" rows="12"></textarea>');
      if (item) {
        form.date.value = item.date || "";
        form.title.value = item.title || "";
        form.excerpt.value = item.excerpt || "";
        form.category.value = item.category || "学记";
        form.tags.value = (item.tags || []).join(" ");
        form.minutes.value = item.minutes || "";
        form.body.value = item.body || "";
      }
    } else {
      form.innerHTML = field("日期", '<input name="date">')
        + field("正文", '<textarea name="text" rows="8" required></textarea>')
        + field("标签", '<input name="tags">');
      if (item) {
        form.date.value = item.date || "";
        form.text.value = item.text || "";
        form.tags.value = (item.tags || []).join(" ");
      }
    }
    const save = document.createElement("button");
    save.className = "gb__submit";
    save.type = "submit";
    save.textContent = "保存";
    form.appendChild(save);
    const tools = bindImageInput(form.querySelector("textarea"));
    form.append(tools[0], tools[1]);
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const path = kind === "article" ? "/api/admin/articles" : "/api/admin/notes";
      const body = kind === "article"
        ? {
          date: form.date.value,
          title: form.title.value,
          excerpt: form.excerpt.value,
          category: form.category.value,
          tags: splitTags(form.tags.value),
          minutes: form.minutes.value,
          body: form.body.value
        }
        : { date: form.date.value, text: form.text.value, tags: splitTags(form.tags.value) };
      try {
        await send(item ? path + "/" + item.id : path, {
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
  }

  function renderRows(section, title, rows) {
    section.innerHTML = "<h2>" + title + "</h2>";
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "新建";
    section.appendChild(add);
    rows.forEach(function (row) { section.appendChild(row); });
    const host = document.createElement("div");
    host.dataset.editor = "";
    section.appendChild(host);
    return add;
  }

  function renderArticles(items) {
    const section = document.querySelector("[data-articles]");
    const rows = items.map(function (item) {
      const p = document.createElement("p");
      p.textContent = item.title + " ";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "编辑";
      edit.addEventListener("click", function () { openEditor(section, "article", item); });
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "删除";
      del.addEventListener("click", async function () {
        if (!confirm("删除「" + item.title + "」？")) return;
        await send("/api/admin/articles/" + item.id, { method: "DELETE" });
        deskStatus.textContent = "已经生效";
        await load();
      });
      p.append(edit, del);
      return p;
    });
    const add = renderRows(section, "文章", rows);
    add.addEventListener("click", function () { openEditor(section, "article", null); });
  }

  function renderNotes(items) {
    const section = document.querySelector("[data-notes]");
    const rows = items.map(function (item) {
      const p = document.createElement("p");
      p.textContent = item.text.slice(0, 40) + " ";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "编辑";
      edit.addEventListener("click", function () { openEditor(section, "note", item); });
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "删除";
      del.addEventListener("click", async function () {
        if (!confirm("删除这则手记？")) return;
        await send("/api/admin/notes/" + item.id, { method: "DELETE" });
        deskStatus.textContent = "已经生效";
        await load();
      });
      p.append(edit, del);
      return p;
    });
    const add = renderRows(section, "手记", rows);
    add.addEventListener("click", function () { openEditor(section, "note", null); });
  }

  function renderPlain(section, title, items, label, onDelete) {
    section.innerHTML = "<h2>" + title + "</h2>";
    items.forEach(function (item) {
      const p = document.createElement("p");
      p.textContent = label(item) + " ";
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "删除";
      del.addEventListener("click", function () { onDelete(item); });
      p.appendChild(del);
      section.appendChild(p);
    });
  }

  async function load() {
    const site = await send("/api/site");
    const book = await send("/api/guestbook");
    renderArticles(site.articles || []);
    renderNotes(site.notes || []);
    aboutForm.paragraphs.value = ((site.about && site.about.paragraphs) || []).join("\n\n");
    renderPlain(document.querySelector("[data-timeline]"), "时间线", site.timeline || [], function (item) {
      return item.date + " " + item.text;
    }, async function (item) {
      await send("/api/admin/timeline/" + item.id, { method: "DELETE" });
      deskStatus.textContent = "已经生效";
      await load();
    });
    renderPlain(document.querySelector("[data-guestbook]"), "留言", book.items || [], function (item) {
      return item.name + "：" + item.message;
    }, async function (item) {
      await send("/api/admin/guestbook/" + item.id, { method: "DELETE" });
      deskStatus.textContent = "已经生效";
      await load();
    });
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

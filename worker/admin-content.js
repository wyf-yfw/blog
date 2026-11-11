import { handleDrafts } from "./drafts.js";
import { json, readJson } from "./http.js";
import { newId } from "./ids.js";
import { shanghaiNow } from "./time.js";
import { recordTimeline } from "./timeline.js";
import { decideLink, listForAdmin } from "./links.js";
import { aboutInput, articleInput, goalsInput, noteInput } from "./validate.js";

function idFrom(path, prefix) {
  return decodeURIComponent(path.slice(prefix.length));
}

export async function handleContent(request, env, session) {
  const path = new URL(request.url).pathname;

  if (path.startsWith("/api/admin/drafts")) {
    const draft = await handleDrafts(request, env, new Date());
    if (draft) return draft;
  }

  const now = new Date();
  const today = shanghaiNow(now).date;
  const db = env.DB;
  const ts = now.toISOString();

  if (path === "/api/admin/articles" && request.method === "POST") {
    const item = articleInput(await readJson(request), today);
    const id = newId();
    await db.prepare(
      `INSERT INTO articles
        (id, date, title, excerpt, category, tags, minutes, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, item.date, item.title, item.excerpt, item.category, JSON.stringify(item.tags), item.minutes, item.body, ts, ts).run();
    await recordTimeline(db, "article", "create", item.title, now);
    return json({ id });
  }

  if (path.startsWith("/api/admin/articles/") && request.method === "PUT") {
    const id = idFrom(path, "/api/admin/articles/");
    const current = await db.prepare("SELECT id FROM articles WHERE id = ?").bind(id).first();
    if (!current) return json({ error: "not_found", hint: "没有这篇文章" }, 404);
    const item = articleInput(await readJson(request), today);
    await db.prepare(
      `UPDATE articles
       SET date = ?, title = ?, excerpt = ?, category = ?, tags = ?, minutes = ?, body = ?, updated_at = ?
       WHERE id = ?`
    ).bind(item.date, item.title, item.excerpt, item.category, JSON.stringify(item.tags), item.minutes, item.body, ts, id).run();
    await recordTimeline(db, "article", "update", item.title, now);
    return json({ id });
  }

  if (path.startsWith("/api/admin/articles/") && request.method === "DELETE") {
    const id = idFrom(path, "/api/admin/articles/");
    const current = await db.prepare("SELECT title FROM articles WHERE id = ?").bind(id).first();
    if (!current) return json({ error: "not_found", hint: "没有这篇文章" }, 404);
    await db.batch([
      db.prepare("DELETE FROM articles WHERE id = ?").bind(id),
      db.prepare("DELETE FROM drafts WHERE draft_key = ?").bind(id),
    ]);
    await recordTimeline(db, "article", "delete", current.title, now);
    return json({ ok: true });
  }

  if (path === "/api/admin/notes" && request.method === "POST") {
    const item = noteInput(await readJson(request), today);
    const id = newId();
    await db.prepare(
      "INSERT INTO notes (id, date, text, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(id, item.date, item.text, JSON.stringify(item.tags), ts, ts).run();
    await recordTimeline(db, "note", "create", item.text, now);
    return json({ id });
  }

  if (path.startsWith("/api/admin/notes/") && request.method === "PUT") {
    const id = idFrom(path, "/api/admin/notes/");
    const current = await db.prepare("SELECT id FROM notes WHERE id = ?").bind(id).first();
    if (!current) return json({ error: "not_found", hint: "没有这篇手记" }, 404);
    const item = noteInput(await readJson(request), today);
    await db.prepare(
      "UPDATE notes SET date = ?, text = ?, tags = ?, updated_at = ? WHERE id = ?"
    ).bind(item.date, item.text, JSON.stringify(item.tags), ts, id).run();
    await recordTimeline(db, "note", "update", item.text, now);
    return json({ id });
  }

  if (path.startsWith("/api/admin/notes/") && request.method === "DELETE") {
    const id = idFrom(path, "/api/admin/notes/");
    const current = await db.prepare("SELECT text FROM notes WHERE id = ?").bind(id).first();
    if (!current) return json({ error: "not_found", hint: "没有这篇手记" }, 404);
    await db.prepare("DELETE FROM notes WHERE id = ?").bind(id).run();
    await recordTimeline(db, "note", "delete", current.text, now);
    return json({ ok: true });
  }

  if (path === "/api/admin/about" && request.method === "PUT") {
    const body = await readJson(request);
    const paragraphs = aboutInput(body);
    await db.prepare(
      `INSERT INTO about (id, paragraphs, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET paragraphs = excluded.paragraphs, updated_at = excluded.updated_at`
    ).bind(JSON.stringify(paragraphs), ts).run();
    if (body.goals != null) {
      const goals = goalsInput(body.goals);
      await db.prepare(
        `INSERT INTO goals (id, year, items, updated_at) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET year = excluded.year, items = excluded.items, updated_at = excluded.updated_at`
      ).bind(goals.year, JSON.stringify(goals.items), ts).run();
    }
    await recordTimeline(db, "about", "update", "", now);
    return json({ ok: true });
  }

  if (path === "/api/admin/links" && request.method === "GET") {
    return json(await listForAdmin(db));
  }

  if (path.startsWith("/api/admin/links/") && request.method === "POST") {
    const rest = path.slice("/api/admin/links/".length);
    const cut = rest.lastIndexOf("/");
    if (cut <= 0) return null;
    const action = rest.slice(cut + 1);
    if (action !== "approve" && action !== "reject") return null;
    const id = decodeURIComponent(rest.slice(0, cut));
    const found = await decideLink(db, id, action, now);
    if (!found) return json({ error: "not_found", hint: "没有这条申请" }, 404);
    return json({ ok: true });
  }

  if (path.startsWith("/api/admin/timeline/") && request.method === "DELETE") {
    const id = idFrom(path, "/api/admin/timeline/");
    await db.prepare("DELETE FROM timeline WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  if (path.startsWith("/api/admin/guestbook/") && request.method === "DELETE") {
    const id = idFrom(path, "/api/admin/guestbook/");
    await db.prepare("DELETE FROM guestbook WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  return null;
}

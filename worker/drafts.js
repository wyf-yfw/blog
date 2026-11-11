import { json, readJson } from "./http.js";
import { CATS } from "./validate.js";

const PREFIX = "/api/admin/drafts";
const MAX_BODY = 200000;
const MAX_TITLE = 200;

function keyFrom(path) {
  const raw = decodeURIComponent(path.slice(PREFIX.length + 1));
  return /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : null;
}

function clean(input, today) {
  const body = input || {};
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "")) ? String(body.date) : today;
  const category = CATS.includes(body.category) ? body.category : CATS[0];
  const tags = Array.isArray(body.tags)
    ? body.tags.slice(0, 10).map((t) => String(t).slice(0, 20)).filter(Boolean)
    : [];
  return {
    title: String(body.title || "").slice(0, MAX_TITLE),
    date,
    excerpt: String(body.excerpt || "").slice(0, 200),
    category,
    tags: JSON.stringify(tags),
    body: String(body.body == null ? "" : body.body).slice(0, MAX_BODY),
  };
}

function shape(row) {
  return {
    key: row.draft_key,
    title: row.title,
    date: row.date,
    excerpt: row.excerpt,
    category: row.category,
    tags: JSON.parse(row.tags || "[]"),
    body: row.body,
    updatedAt: row.updated_at,
  };
}

export async function handleDrafts(request, env, now) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  const ts = now.toISOString();
  const today = ts.slice(0, 10);

  if (path === PREFIX && request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT * FROM drafts ORDER BY updated_at DESC LIMIT 20"
    ).all();
    return json({ items: (results || []).map(shape) });
  }

  if (!path.startsWith(PREFIX + "/")) return null;
  const key = keyFrom(path);
  if (!key) return json({ error: "invalid", hint: "草稿标识不对" }, 400);

  if (request.method === "PUT") {
    const item = clean(await readJson(request), today);
    await env.DB.prepare(
      `INSERT INTO drafts (draft_key, title, date, excerpt, category, tags, body, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(draft_key) DO UPDATE SET
         title = excluded.title, date = excluded.date, excerpt = excluded.excerpt,
         category = excluded.category, tags = excluded.tags, body = excluded.body,
         updated_at = excluded.updated_at`
    ).bind(key, item.title, item.date, item.excerpt, item.category, item.tags, item.body, ts).run();
    return json({ ok: true, updatedAt: ts });
  }

  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM drafts WHERE draft_key = ?").bind(key).first();
    return row ? json(shape(row)) : json({ error: "not_found", hint: "没有这份草稿" }, 404);
  }

  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM drafts WHERE draft_key = ?").bind(key).run();
    return json({ ok: true });
  }

  return null;
}

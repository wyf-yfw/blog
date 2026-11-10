import { fail, json, readJson } from "./http.js";
import { newId } from "./ids.js";

export function clientIp(request) {
  return request.headers.get("cf-connecting-ip")
    || (request.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    || "unknown";
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function listItems(db) {
  const rows = await db.prepare(
    "SELECT id, name, message, created FROM guestbook ORDER BY created DESC, rowid DESC LIMIT 200"
  ).all();
  return rows.results;
}

async function trim(db) {
  const extra = await db.prepare(
    "SELECT id FROM guestbook ORDER BY created DESC, rowid DESC LIMIT -1 OFFSET 200"
  ).all();
  for (const row of extra.results) {
    await db.prepare("DELETE FROM guestbook WHERE id = ?").bind(row.id).run();
  }
}

export async function handleGuestbook(request, env) {
  if (request.method === "GET") return json({ items: await listItems(env.DB) });
  if (request.method !== "POST") return fail(405, "method_not_allowed", "不支持这个方法");

  const body = await readJson(request);
  if (String(body["bot-field"] || "").trim()) return json({ ok: true });

  const name = String(body.name || "").trim().slice(0, 40);
  const message = String(body.message || "").trim().slice(0, 1000);
  if (!name || !message) return fail(400, "invalid", "昵称和留言都要填");

  const now = Date.now();
  const ipHash = await sha256Hex(clientIp(request));
  const limit = await env.DB.prepare("SELECT last_at FROM guestbook_limits WHERE ip_hash = ?").bind(ipHash).first();
  if (limit && now - limit.last_at < 15000) {
    return fail(429, "rate_limited", "发太快了，稍等几秒再试");
  }

  const item = { id: newId(), name, message, created: new Date(now).toISOString() };
  await env.DB.prepare(
    "INSERT INTO guestbook (id, name, message, created) VALUES (?, ?, ?, ?)"
  ).bind(item.id, item.name, item.message, item.created).run();
  await env.DB.prepare(
    "INSERT INTO guestbook_limits (ip_hash, last_at) VALUES (?, ?) ON CONFLICT(ip_hash) DO UPDATE SET last_at = excluded.last_at"
  ).bind(ipHash, now).run();
  await trim(env.DB);
  return json({ ok: true, item, items: await listItems(env.DB) });
}

import { clientIp, sha256Hex } from "./guestbook.js";
import { fail, json, readJson } from "./http.js";
import { newId } from "./ids.js";
import { linkApplyInput, linkUrlKey } from "./validate.js";

const GAP = 15000;
const PENDING_CAP = 40;

function sameSite(left, right) {
  try { return linkUrlKey(left) === linkUrlKey(right); } catch (e) { return false; }
}

export async function listForAdmin(db) {
  const rows = await db.prepare(
    "SELECT id, name, url, note, status, created_at, reviewed_at FROM links"
  ).all();
  const pending = [];
  const approved = [];
  const rejected = [];
  for (const row of rows.results) {
    const item = { id: row.id, name: row.name, url: row.url, note: row.note, createdAt: row.created_at };
    if (row.status === "pending") pending.push(item);
    else if (row.status === "approved") approved.push({ ...item, reviewedAt: row.reviewed_at });
    else if (row.status === "rejected") rejected.push(item);
  }
  pending.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  approved.sort((a, b) => (a.reviewedAt || "").localeCompare(b.reviewedAt || "") || a.id.localeCompare(b.id));
  rejected.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  return { pending, approved, rejected };
}

export async function removeLink(db, id) {
  const row = await db.prepare("SELECT status FROM links WHERE id = ?").bind(id).first();
  if (!row || row.status !== "approved") return false;
  await db.prepare("DELETE FROM links WHERE id = ? AND status = 'approved'").bind(id).run();
  return true;
}

export async function decideLink(db, id, action, now) {
  const row = await db.prepare("SELECT status FROM links WHERE id = ?").bind(id).first();
  if (!row) return false;
  if (row.status !== "pending") return true;
  const status = action === "approve" ? "approved" : "rejected";
  await db.prepare(
    "UPDATE links SET status = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'"
  ).bind(status, now.toISOString(), id).run();
  return true;
}

export async function handleLinks(request, env) {
  if (request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT name, url, note FROM links WHERE status = 'approved' ORDER BY reviewed_at ASC, id ASC"
    ).all();
    return json({ items: rows.results });
  }
  if (request.method !== "POST") return fail(405, "method_not_allowed", "不支持这个方法");

  const body = await readJson(request);
  if (String(body["bot-field"] || "").trim()) return json({ ok: true });

  const item = linkApplyInput(body);
  const existing = await env.DB.prepare(
    "SELECT url, status FROM links WHERE status IN ('pending', 'approved')"
  ).all();
  for (const row of existing.results) {
    if (!sameSite(row.url, item.url)) continue;
    if (row.status === "approved") return fail(409, "conflict", "这个站点已经在友链里了");
    return fail(409, "conflict", "这个站点已经在等审核");
  }

  const waiting = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM links WHERE status = 'pending'"
  ).first();
  if (waiting && waiting.n >= PENDING_CAP) return fail(429, "rate_limited", "等审核的太多了，稍后再来");

  const now = Date.now();
  const ipHash = await sha256Hex(clientIp(request));
  const limit = await env.DB.prepare("SELECT last_at FROM link_limits WHERE ip_hash = ?").bind(ipHash).first();
  if (limit && now - limit.last_at < GAP) return fail(429, "rate_limited", "申请太快了，稍等几秒再试");

  await env.DB.prepare(
    "INSERT INTO links (id, name, url, note, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)"
  ).bind(newId(), item.name, item.url, item.note, new Date(now).toISOString()).run();
  await env.DB.prepare(
    "INSERT INTO link_limits (ip_hash, last_at) VALUES (?, ?) ON CONFLICT(ip_hash) DO UPDATE SET last_at = excluded.last_at"
  ).bind(ipHash, now).run();
  return json({ ok: true });
}

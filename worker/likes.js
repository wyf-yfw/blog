import { sha256Hex } from "./guestbook.js";
import { fail, json, readJson } from "./http.js";

function visitorToken(value) {
  const token = String(value || "");
  return /^[\w-]{16,80}$/.test(token) ? token : "";
}

function subjectOf(kind, id) {
  if (kind !== "post" && kind !== "note") return "";
  if (!/^[\w-]{1,40}$/.test(id)) return "";
  return kind + ":" + id;
}

async function totalOf(db, subject) {
  const row = await db.prepare("SELECT total FROM like_counts WHERE subject = ?").bind(subject).first();
  return row ? row.total : 0;
}

export async function handleLike(request, env) {
  if (request.method !== "POST") return fail(405, "method_not_allowed", "不支持这个方法");
  const body = await readJson(request);
  const id = String(body.id || "");
  const subject = subjectOf(body.kind, id);
  const token = visitorToken(body.visitor);
  if (!subject || !token || typeof body.on !== "boolean") return fail(400, "invalid", "点不了");

  const db = env.DB;
  const table = body.kind === "post" ? "articles" : "notes";
  const found = await db.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(id).first();
  if (!found) return fail(404, "not_found", "没有这篇");

  const visitor = await sha256Hex(token);
  if (body.on) {
    const added = await db.prepare(
      "INSERT INTO like_seen (subject, visitor) VALUES (?, ?) ON CONFLICT(subject, visitor) DO NOTHING"
    ).bind(subject, visitor).run();
    if (added.meta && added.meta.changes) {
      await db.prepare(
        "INSERT INTO like_counts (subject, total) VALUES (?, 1) ON CONFLICT(subject) DO UPDATE SET total = total + 1"
      ).bind(subject).run();
    }
  } else {
    const removed = await db.prepare(
      "DELETE FROM like_seen WHERE subject = ? AND visitor = ?"
    ).bind(subject, visitor).run();
    if (removed.meta && removed.meta.changes) {
      await db.prepare(
        "UPDATE like_counts SET total = MAX(total - 1, 0) WHERE subject = ?"
      ).bind(subject).run();
    }
  }

  const still = await db.prepare(
    "SELECT 1 AS ok FROM like_seen WHERE subject = ? AND visitor = ?"
  ).bind(subject, visitor).first();
  return json({ ok: true, likes: await totalOf(db, subject), liked: Boolean(still) });
}

import { sha256Hex } from "./guestbook.js";
import { fail, json, readJson } from "./http.js";

const PAGES = new Set(["index", "writing", "notes", "about", "timeline", "guestbook", "post"]);

function visitorToken(value) {
  const token = String(value || "");
  return /^[\w-]{16,80}$/.test(token) ? token : "";
}

async function countOnce(db, subject, visitor) {
  const seen = await db.prepare(
    "INSERT INTO view_seen (subject, visitor) VALUES (?, ?) ON CONFLICT(subject, visitor) DO NOTHING"
  ).bind(subject, visitor).run();
  if (!seen.meta || !seen.meta.changes) return;
  await db.prepare(
    "INSERT INTO view_counts (subject, total) VALUES (?, 1) ON CONFLICT(subject) DO UPDATE SET total = total + 1"
  ).bind(subject).run();
}

export async function handleView(request, env) {
  if (request.method !== "POST") return fail(405, "method_not_allowed", "不支持这个方法");
  const body = await readJson(request);
  const page = String(body.page || "");
  const token = visitorToken(body.visitor);
  if (!PAGES.has(page) || !token) return json({ ok: true });
  const visitor = await sha256Hex(token);
  const db = env.DB;
  if (page === "post") {
    const id = String(body.id || "");
    if (/^[\w-]{1,40}$/.test(id)) {
      const article = await db.prepare("SELECT id FROM articles WHERE id = ?").bind(id).first();
      if (article) await countOnce(db, "post:" + id, visitor);
    }
  }
  await countOnce(db, "site", visitor);
  return json({ ok: true });
}

import { fail, json } from "./http.js";

function tagsOf(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function mapArticle(row, views) {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category,
    tags: tagsOf(row.tags),
    minutes: row.minutes == null ? null : row.minutes,
    body: row.body,
    views,
  };
}

function mapNote(row) {
  return { id: row.id, date: row.date, text: row.text, tags: tagsOf(row.tags) };
}

export async function getSite(db) {
  const about = await db.prepare("SELECT paragraphs FROM about WHERE id = 1").first();
  const articles = await db.prepare(
    "SELECT id, date, title, excerpt, category, tags, minutes, body FROM articles ORDER BY date DESC, created_at DESC, id DESC"
  ).all();
  const notes = await db.prepare(
    "SELECT id, date, text, tags FROM notes ORDER BY date DESC, created_at DESC, id DESC"
  ).all();
  const timeline = await db.prepare(
    "SELECT id, date, text, kind FROM timeline ORDER BY date DESC, rowid DESC LIMIT 200"
  ).all();
  const counts = await db.prepare("SELECT subject, total FROM view_counts").all();
  const bySubject = new Map(counts.results.map((row) => [row.subject, row.total]));
  let paragraphs = [];
  if (about) {
    try { paragraphs = JSON.parse(about.paragraphs) || []; } catch (e) { paragraphs = []; }
  }
  return {
    about: { paragraphs },
    articles: articles.results.map((row) => mapArticle(row, bySubject.get("post:" + row.id) || 0)),
    notes: notes.results.map(mapNote),
    timeline: timeline.results,
    views: bySubject.get("site") || 0,
  };
}

export async function handleSite(request, env) {
  if (request.method !== "GET") return fail(405, "method_not_allowed", "不支持这个方法");
  return json(await getSite(env.DB));
}

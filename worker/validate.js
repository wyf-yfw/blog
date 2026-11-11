import { httpError } from "./http.js";

export const CATS = ["学记", "省察", "所见", "存档"];
const PER_MINUTE = 400;

export function readingMinutes(text) {
  const plain = String(text || "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\s/g, "");
  const count = Array.from(plain).length;
  if (!count) return null;
  return Math.min(99, Math.max(1, Math.ceil(count / PER_MINUTE)));
}

function isYmd(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parseTags(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw httpError(400, "invalid", "标签格式不对");
  }
  return value.map((tag) => tag.trim()).filter(Boolean);
}

export function articleInput(body, today) {
  const title = String((body && body.title) || "").trim();
  if (!title) throw httpError(400, "invalid", "标题要填");
  const category = body.category || "学记";
  if (!CATS.includes(category)) throw httpError(400, "invalid", "类别不对");
  const excerpt = String(body.excerpt || "").trim();
  if (excerpt.length > 200) throw httpError(400, "invalid", "摘要太长了");
  const date = body.date ? String(body.date) : today;
  if (!isYmd(date)) throw httpError(400, "invalid", "日期格式不对");
  return {
    date,
    title,
    excerpt,
    category,
    tags: parseTags(body.tags),
    minutes: readingMinutes(body.body),
    body: body.body == null ? "" : String(body.body),
  };
}

export function noteInput(body, today) {
  const text = String((body && body.text) || "").trim();
  if (!text) throw httpError(400, "invalid", "手记要有内容");
  const date = body.date ? String(body.date) : today;
  if (!isYmd(date)) throw httpError(400, "invalid", "日期格式不对");
  return { date, text, tags: parseTags(body.tags) };
}

export function aboutInput(body) {
  const list = body && body.paragraphs;
  if (!Array.isArray(list)) throw httpError(400, "invalid", "段落格式不对");
  return list.map((p) => String(p).trim()).filter(Boolean);
}

export function goalsInput(body) {
  const source = body || {};
  const year = Number(source.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw httpError(400, "invalid", "年份不对");
  }
  if (!Array.isArray(source.items)) throw httpError(400, "invalid", "目标格式不对");
  const items = [];
  for (const item of source.items) {
    const text = String((item && item.text) || "").trim();
    if (!text) continue;
    if (text.length > 80) throw httpError(400, "invalid", "目标太长了");
    items.push({ text, done: Boolean(item && item.done) });
    if (items.length > 20) throw httpError(400, "invalid", "目标太多了");
  }
  return { year, items };
}

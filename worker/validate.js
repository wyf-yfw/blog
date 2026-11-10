import { httpError } from "./http.js";

const CATS = ["学记", "省察", "所见", "存档"];

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
  let minutes = body.minutes;
  if (minutes === "" || minutes == null) minutes = null;
  else {
    minutes = Number(minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 99) {
      throw httpError(400, "invalid", "阅读分钟不对");
    }
  }
  return {
    date,
    title,
    excerpt,
    category,
    tags: parseTags(body.tags),
    minutes,
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

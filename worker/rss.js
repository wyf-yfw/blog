import { fail } from "./http.js";

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LIMIT = 40;

function xml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rfc822(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  if (!match) return "";
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
  return `${WEEK[day]}, ${match[3]} ${MON[Number(match[2]) - 1]} ${match[1]} 00:00:00 +0800`;
}

function tagsOf(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch (e) {
    return [];
  }
}

function summary(text, limit) {
  const plain = String(text || "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/[#>*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= limit) return plain;
  return plain.slice(0, limit).trim() + "…";
}

function escHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(text) {
  return escHtml(text)
    .replace(/!\[([^\]]*)\]\(((?:\/)?assets\/[^)\s]+|\/media\/[^)\s]+|https?:\/\/[^)\s]+)\)/gi,
      '<img src="$2" alt="$1">')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function figure(alt, src) {
  return `<figure><img src="${escHtml(src)}" alt="${escHtml(alt)}"></figure>`;
}

function renderBody(body) {
  const out = [];
  String(body || "").split(/\n{2,}/).forEach((raw) => {
    const block = raw.trim();
    if (!block) return;
    const onlyImg = block.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (onlyImg) {
      out.push(figure(onlyImg[1], onlyImg[2]));
      return;
    }
    if (/^##\s/.test(block)) {
      out.push("<h2>" + inline(block.replace(/^##\s+/, "")) + "</h2>");
      return;
    }
    if (/^>\s/.test(block)) {
      const line = block.split("\n").map((item) => item.replace(/^>\s?/, "").trim()).filter(Boolean).join(" ");
      out.push("<blockquote><p>" + inline(line) + "</p></blockquote>");
      return;
    }
    if (/^[-*]\s/.test(block)) {
      const items = block.split("\n").filter((line) => /^[-*]\s/.test(line))
        .map((line) => "<li>" + inline(line.replace(/^[-*]\s+/, "")) + "</li>");
      out.push("<ul>" + items.join("") + "</ul>");
      return;
    }
    block.split("\n").map((line) => line.trim()).filter(Boolean).forEach((line) => {
      const img = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
      out.push(img ? figure(img[1], img[2]) : "<p>" + inline(line) + "</p>");
    });
  });
  return out.join("\n");
}

function absoluteHtml(html, origin) {
  return html.replace(/(src|href)="([^"]+)"/g, (all, attr, url) => {
    if (/^https?:\/\//i.test(url)) return all;
    if (url.startsWith("/")) return `${attr}="${origin}${url}"`;
    if (url.startsWith("assets/")) return `${attr}="${origin}/${url}"`;
    return all;
  });
}

function itemXml(entry) {
  const categories = entry.categories.map((name) => `      <category>${xml(name)}</category>`).join("\n");
  return [
    "    <item>",
    `      <title>${xml(entry.title)}</title>`,
    `      <link>${xml(entry.link)}</link>`,
    `      <guid isPermaLink="true">${xml(entry.link)}</guid>`,
    `      <pubDate>${xml(entry.pubDate)}</pubDate>`,
    categories,
    `      <description>${xml(entry.summary)}</description>`,
    `      <content:encoded>${xml(entry.html)}</content:encoded>`,
    "    </item>",
  ].filter(Boolean).join("\n");
}

export async function handleRss(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return fail(405, "method_not_allowed", "不支持这个方法");
  }
  const origin = new URL(request.url).origin;
  const db = env.DB;
  const articles = await db.prepare(
    "SELECT id, date, title, excerpt, category, tags, body, created_at FROM articles"
  ).all();
  const notes = await db.prepare(
    "SELECT id, date, text, tags, created_at FROM notes"
  ).all();

  const items = [];
  for (const row of articles.results) {
    const link = `${origin}/post.html?p=${encodeURIComponent(row.id)}`;
    items.push({
      date: row.date,
      id: row.id,
      title: row.title,
      link,
      pubDate: rfc822(row.date),
      categories: [row.category].concat(tagsOf(row.tags)).filter(Boolean),
      summary: row.excerpt || summary(row.body, 160),
      html: absoluteHtml(renderBody(row.body), origin),
    });
  }
  for (const row of notes.results) {
    const link = `${origin}/notes.html#note-${encodeURIComponent(row.id)}`;
    items.push({
      date: row.date,
      id: row.id,
      title: summary(row.text, 36) || "手记",
      link,
      pubDate: rfc822(row.date),
      categories: ["手记"].concat(tagsOf(row.tags)),
      summary: summary(row.text, 160),
      html: absoluteHtml(renderBody(row.text), origin),
    });
  }

  items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return String(b.id).localeCompare(String(a.id));
  });
  const recent = items.slice(0, LIMIT);
  const self = `${origin}/rss.xml`;
  const updated = recent[0] ? recent[0].pubDate : rfc822(new Date().toISOString().slice(0, 10));
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    "  <channel>",
    "    <title>Kris</title>",
    `    <link>${xml(origin + "/")}</link>`,
    "    <description>Kris 的个人网站。</description>",
    "    <language>zh-CN</language>",
    `    <lastBuildDate>${xml(updated)}</lastBuildDate>`,
    `    <atom:link href="${xml(self)}" rel="self" type="application/rss+xml"/>`,
    recent.map(itemXml).join("\n"),
    "  </channel>",
    "</rss>",
    "",
  ].filter((line) => line !== "").join("\n");

  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
}

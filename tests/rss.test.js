import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import worker from "../worker/index.js";
import { resetDb } from "./helpers.js";

beforeEach(() => resetDb());

function feed() {
  return worker.fetch(new Request("https://kris.test/rss.xml"), env);
}

test("空库也返回一份可订阅的 RSS", async () => {
  const res = await feed();
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/rss+xml");
  expect(res.headers.get("cache-control")).toContain("max-age=300");
  const xml = await res.text();
  expect(xml).toContain("<title>Kris</title>");
  expect(xml).toContain('href="https://kris.test/rss.xml"');
  expect(xml).not.toContain("<item>");
});

test("文章和手记按时间排进订阅，链接和图片都是完整地址", async () => {
  await env.DB.prepare(
    `INSERT INTO articles
      (id, date, title, excerpt, category, tags, minutes, body, created_at, updated_at)
     VALUES ('a-old', '2026-11-09', '旧', '', '学记', '[]', NULL, '旧正文', 't', 't')`
  ).run();
  await env.DB.prepare(
    `INSERT INTO articles
      (id, date, title, excerpt, category, tags, minutes, body, created_at, updated_at)
     VALUES ('a-new', '2026-11-13', '甲 & 乙 <丙>', '摘要', '省察', '["记"]', 3, '正文\n\n![图](/media/a.jpg)', 't', 't')`
  ).run();
  await env.DB.prepare(
    "INSERT INTO notes (id, date, text, tags, created_at, updated_at) VALUES ('n1', '2026-11-13', '一句手记', '[\"随笔\"]', 't', 't')"
  ).run();

  const xml = await (await feed()).text();
  const titles = [...xml.matchAll(/<item>[\s\S]*?<title>([^<]*)<\/title>/g)].map((match) => match[1]);
  expect(titles).toEqual(["一句手记", "甲 &amp; 乙 &lt;丙&gt;", "旧"]);
  expect(xml).toContain("<link>https://kris.test/post.html?p=a-new</link>");
  expect(xml).toContain("<link>https://kris.test/notes.html#note-n1</link>");
  expect(xml).toContain("<description>摘要</description>");
  expect(xml).toContain("src=&quot;https://kris.test/media/a.jpg&quot;");
  expect(xml).toContain("<category>省察</category>");
  expect(xml).toContain("<category>手记</category>");
  expect(xml).toContain("Fri, 13 Nov 2026 00:00:00 +0800");
});

test("订阅地址不接受写入", async () => {
  const res = await worker.fetch(new Request("https://kris.test/rss.xml", { method: "POST" }), env);
  expect(res.status).toBe(405);
});

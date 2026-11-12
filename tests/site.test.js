import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import worker from "../worker/index.js";
import { resetDb } from "./helpers.js";

beforeEach(() => resetDb());

test("空库返回空集合", async () => {
  const res = await worker.fetch(new Request("https://kris.test/api/site"), env);
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.json()).toEqual({
    about: { paragraphs: [], photo: "", goals: { year: null, items: [] } },
    articles: [],
    notes: [],
    timeline: [],
    views: 0,
  });
});

test("读出文章、手记、关于和时间线", async () => {
  await env.DB.prepare(
    "INSERT INTO about (id, paragraphs, updated_at) VALUES (1, ?, ?)"
  ).bind(JSON.stringify(["甲", "乙"]), "2026-11-10T00:00:00.000Z").run();
  await env.DB.prepare(
    `INSERT INTO articles
      (id, date, title, excerpt, category, tags, minutes, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind("a1", "2026-11-09", "题", "摘", "学记", JSON.stringify(["记"]), 8, "正文", "t", "t").run();
  await env.DB.prepare(
    "INSERT INTO notes (id, date, text, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind("n1", "2026-11-09", "一句", "[]", "t", "t").run();
  await env.DB.prepare(
    "INSERT INTO timeline (id, date, text, kind) VALUES (?, ?, ?, ?)"
  ).bind("t1", "2026-11-09 16:50", "记了一笔", "note").run();

  const body = await (await worker.fetch(new Request("https://kris.test/api/site"), env)).json();
  expect(body.about.paragraphs).toEqual(["甲", "乙"]);
  expect(body.articles[0]).toMatchObject({
    id: "a1", title: "题", excerpt: "摘", category: "学记", tags: ["记"], minutes: 8, body: "正文",
  });
  expect(body.notes[0]).toMatchObject({ id: "n1", text: "一句", tags: [] });
  expect(body.timeline[0]).toEqual({ id: "t1", date: "2026-11-09 16:50", text: "记了一笔", kind: "note" });
});

test("文章和手记最新的排在前面", async () => {
  const insertArticle = (id, date, created) => env.DB.prepare(
    `INSERT INTO articles
      (id, date, title, excerpt, category, tags, minutes, body, created_at, updated_at)
     VALUES (?, ?, ?, '', '学记', '[]', 1, '', ?, ?)`
  ).bind(id, date, id, created, created).run();
  const insertNote = (id, date, created) => env.DB.prepare(
    "INSERT INTO notes (id, date, text, tags, created_at, updated_at) VALUES (?, ?, ?, '[]', ?, ?)"
  ).bind(id, date, id, created, created).run();
  await insertArticle("old", "2026-11-09", "2026-11-09T01:00:00.000Z");
  await insertArticle("same-early", "2026-11-10", "2026-11-10T01:00:00.000Z");
  await insertArticle("same-late", "2026-11-10", "2026-11-10T09:00:00.000Z");
  await insertNote("old", "2026-11-09", "2026-11-09T01:00:00.000Z");
  await insertNote("same-early", "2026-11-10", "2026-11-10T01:00:00.000Z");
  await insertNote("same-late", "2026-11-10", "2026-11-10T09:00:00.000Z");
  const body = await (await worker.fetch(new Request("https://kris.test/api/site"), env)).json();
  expect(body.articles.map((item) => item.id)).toEqual(["same-late", "same-early", "old"]);
  expect(body.notes.map((item) => item.id)).toEqual(["same-late", "same-early", "old"]);
});

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
    about: { paragraphs: [] },
    articles: [],
    notes: [],
    timeline: [],
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

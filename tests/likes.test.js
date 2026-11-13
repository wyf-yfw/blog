import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import worker from "../worker/index.js";
import { resetDb } from "./helpers.js";

const DEVICE = "device-one-aaaaaa";
const OTHER = "device-two-bbbbbb";

beforeEach(() => resetDb());

function like(body) {
  return worker.fetch(new Request("https://kris.test/api/like", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), env);
}

async function site() {
  return (await worker.fetch(new Request("https://kris.test/api/site"), env)).json();
}

async function seed() {
  await env.DB.prepare(
    `INSERT INTO articles
      (id, date, title, excerpt, category, tags, minutes, body, created_at, updated_at)
     VALUES ('a1', '2026-11-09', '题', '', '学记', '[]', NULL, '文', 't', 't')`
  ).run();
  await env.DB.prepare(
    "INSERT INTO notes (id, date, text, tags, created_at, updated_at) VALUES ('n1', '2026-11-09', '一句', '[]', 't', 't')"
  ).run();
}

test("同一设备点赞只算一次，再点取消，换一台另算", async () => {
  await seed();
  const first = await like({ kind: "post", id: "a1", visitor: DEVICE, on: true });
  expect(first.status).toBe(200);
  expect(await first.json()).toEqual({ ok: true, likes: 1, liked: true });
  expect(await (await like({ kind: "post", id: "a1", visitor: DEVICE, on: true })).json()).toMatchObject({ likes: 1, liked: true });
  expect(await (await like({ kind: "post", id: "a1", visitor: OTHER, on: true })).json()).toMatchObject({ likes: 2, liked: true });
  expect(await (await like({ kind: "post", id: "a1", visitor: DEVICE, on: false })).json()).toMatchObject({ likes: 1, liked: false });
  const body = await site();
  expect(body.articles[0]).toMatchObject({ id: "a1", likes: 1 });
  expect(body.notes[0]).toMatchObject({ id: "n1", likes: 0 });
  const stored = await env.DB.prepare("SELECT visitor FROM like_seen WHERE subject = 'post:a1'").all();
  expect(stored.results).toHaveLength(1);
  expect(stored.results[0].visitor).not.toBe(OTHER);
  expect(stored.results[0].visitor).toHaveLength(64);
});

test("手记和文章分开计数，没有的篇目点不了", async () => {
  await seed();
  expect((await like({ kind: "note", id: "n1", visitor: DEVICE, on: true })).status).toBe(200);
  expect((await like({ kind: "note", id: "missing", visitor: DEVICE, on: true })).status).toBe(404);
  expect((await like({ kind: "post", id: "nope", visitor: DEVICE, on: true })).status).toBe(404);
  expect((await like({ kind: "note", id: "n1", visitor: OTHER, on: false })).status).toBe(200);
  const body = await site();
  expect(body.notes[0].likes).toBe(1);
  expect(body.articles[0].likes).toBe(0);
});

test("缺标识或方法不对时不计数", async () => {
  await seed();
  expect((await like({ kind: "post", id: "a1", on: true })).status).toBe(400);
  expect((await like({ kind: "page", id: "a1", visitor: DEVICE, on: true })).status).toBe(400);
  const got = await worker.fetch(new Request("https://kris.test/api/like"), env);
  expect(got.status).toBe(405);
  expect((await site()).articles[0].likes).toBe(0);
});

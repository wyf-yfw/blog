import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import worker from "../worker/index.js";
import { resetDb } from "./helpers.js";

const DEVICE = "device-one-aaaaaa";
const OTHER = "device-two-bbbbbb";

beforeEach(() => resetDb());

function view(body) {
  return worker.fetch(new Request("https://kris.test/api/view", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), env);
}

async function site() {
  return (await worker.fetch(new Request("https://kris.test/api/site"), env)).json();
}

test("同一设备反复打开只算一次，换一台才加", async () => {
  expect((await view({ page: "about", visitor: DEVICE })).status).toBe(200);
  await view({ page: "index", visitor: DEVICE });
  await view({ page: "about", visitor: DEVICE });
  expect((await site()).views).toBe(1);
  await view({ page: "notes", visitor: OTHER });
  expect((await site()).views).toBe(2);
  const stored = await env.DB.prepare("SELECT visitor FROM view_seen WHERE subject = 'site'").all();
  expect(stored.results).toHaveLength(2);
  expect(stored.results.every((row) => row.visitor !== DEVICE && row.visitor.length === 64)).toBe(true);
});

test("文章按设备各算一次，没有的文章不计", async () => {
  await env.DB.prepare(
    `INSERT INTO articles
      (id, date, title, excerpt, category, tags, minutes, body, created_at, updated_at)
     VALUES ('a1', '2026-11-09', '题', '', '学记', '[]', NULL, '文', 't', 't')`
  ).run();
  await view({ page: "post", id: "a1", visitor: DEVICE });
  await view({ page: "post", id: "a1", visitor: DEVICE });
  await view({ page: "post", id: "missing", visitor: DEVICE });
  await view({ page: "post", id: "a1", visitor: OTHER });
  const body = await site();
  expect(body.views).toBe(2);
  expect(body.articles[0]).toMatchObject({ id: "a1", views: 2 });
});

test("没有设备标识或不是公开页时不计数", async () => {
  await view({ page: "about" });
  await view({ page: "admin", visitor: DEVICE });
  const got = await worker.fetch(new Request("https://kris.test/api/view"), env);
  expect(got.status).toBe(405);
  expect((await site()).views).toBe(0);
});

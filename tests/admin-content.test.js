import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import { hashPassword } from "../worker/password.js";
import worker from "../worker/index.js";
import { resetDb } from "./helpers.js";

let cookie;

beforeEach(async () => {
  await resetDb();
  await env.DB.prepare(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)"
  ).bind("kris", await hashPassword("secret-pass"), "2026-11-10T00:00:00.000Z").run();
  const login = await worker.fetch(new Request("https://kris.test/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "kris", password: "secret-pass" }),
  }), env);
  cookie = login.headers.get("set-cookie").split(";")[0];
});

function send(path, method, body) {
  return worker.fetch(new Request("https://kris.test" + path, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body ? JSON.stringify(body) : undefined,
  }), env);
}

test("未登录不能写文章", async () => {
  const res = await worker.fetch(new Request("https://kris.test/api/admin/articles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "题" }),
  }), env);
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ hint: "先登录" });
});

test("连续更新同一标题只刷新时间线时间", async () => {
  const created = await send("/api/admin/articles", "POST", { title: "题", body: "文" });
  const id = (await created.json()).id;
  await send("/api/admin/articles/" + id, "PUT", { title: "题", body: "一" });
  await env.DB.prepare("UPDATE timeline SET date = ? WHERE text = ?").bind("2000-01-01 00:00", "更新了文章：题").run();
  await env.DB.prepare("UPDATE timeline SET date = ? WHERE text <> ?").bind("1999-01-01 00:00", "更新了文章：题").run();
  await send("/api/admin/articles/" + id, "PUT", { title: "题", body: "二" });
  const rows = await env.DB.prepare(
    "SELECT date, text FROM timeline WHERE text = ?"
  ).bind("更新了文章：题").all();
  expect(rows.results).toHaveLength(1);
  expect(rows.results[0].date).not.toBe("2000-01-01 00:00");
});

test("删除手记会记一条，删除时间线本身不会再记", async () => {
  const created = await send("/api/admin/notes", "POST", { text: "一句" });
  const id = (await created.json()).id;
  await send("/api/admin/notes/" + id, "DELETE");
  const after = await env.DB.prepare("SELECT text FROM timeline ORDER BY date DESC, rowid DESC").all();
  expect(after.results[0].text).toBe("删除了手记：一句");
  const timelineId = (await env.DB.prepare("SELECT id FROM timeline LIMIT 1").first()).id;
  const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM timeline").first();
  const removed = await send("/api/admin/timeline/" + timelineId, "DELETE");
  expect(removed.status).toBe(200);
  const afterCount = await env.DB.prepare("SELECT COUNT(*) AS n FROM timeline").first();
  expect(afterCount.n).toBe(before.n - 1);
});

test("关于按段落保存", async () => {
  const res = await send("/api/admin/about", "PUT", { paragraphs: ["甲", "  ", "乙"] });
  expect(res.status).toBe(200);
  const site = await (await worker.fetch(new Request("https://kris.test/api/site"), env)).json();
  expect(site.about.paragraphs).toEqual(["甲", "乙"]);
});

test("年度目标能保存，只改段落不会清掉", async () => {
  const saved = await send("/api/admin/about", "PUT", {
    paragraphs: ["甲"],
    goals: { year: 2026, items: [{ text: "写完", done: true }, { text: "跑步", done: false }] },
  });
  expect(saved.status).toBe(200);
  await send("/api/admin/about", "PUT", { paragraphs: ["甲", "乙"] });
  const site = await (await worker.fetch(new Request("https://kris.test/api/site"), env)).json();
  expect(site.about.paragraphs).toEqual(["甲", "乙"]);
  expect(site.about.goals).toEqual({
    year: 2026,
    items: [{ text: "写完", done: true }, { text: "跑步", done: false }],
  });
});

test("友链申请要审核，不同意和没审的都不公开", async () => {
  const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM timeline").first();
  const applied = await worker.fetch(new Request("https://kris.test/api/links", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
    body: JSON.stringify({ name: "甲", url: "https://example.com/a", note: "一句" }),
  }), env);
  expect(applied.status).toBe(200);
  const hidden = await (await worker.fetch(new Request("https://kris.test/api/links"), env)).json();
  expect(hidden.items).toEqual([]);
  const queue = await (await send("/api/admin/links", "GET")).json();
  expect(queue.pending).toEqual([expect.objectContaining({ name: "甲", url: "https://example.com/a", note: "一句" })]);
  const id = queue.pending[0].id;

  const again = await worker.fetch(new Request("https://kris.test/api/links", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.11" },
    body: JSON.stringify({ name: "甲二", url: "https://example.com/a/", note: "" }),
  }), env);
  expect(again.status).toBe(409);

  const approved = await send("/api/admin/links/" + id + "/approve", "POST");
  expect(approved.status).toBe(200);
  const open = await (await worker.fetch(new Request("https://kris.test/api/links"), env)).json();
  expect(open.items).toEqual([{ name: "甲", url: "https://example.com/a", note: "一句" }]);

  const second = await worker.fetch(new Request("https://kris.test/api/links", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.12" },
    body: JSON.stringify({ name: "乙", url: "https://example.org", note: "" }),
  }), env);
  expect(second.status).toBe(200);
  const queued = await (await send("/api/admin/links", "GET")).json();
  const other = queued.pending[0].id;
  const rejected = await send("/api/admin/links/" + other + "/reject", "POST");
  expect(rejected.status).toBe(200);
  await send("/api/admin/links/" + other + "/approve", "POST");
  const after = await (await worker.fetch(new Request("https://kris.test/api/links"), env)).json();
  expect(after.items.map((item) => item.name)).toEqual(["甲"]);
  const decided = await (await send("/api/admin/links", "GET")).json();
  expect(decided.pending).toEqual([]);
  expect(decided.rejected.map((item) => item.name)).toEqual(["乙"]);
  const timeline = await env.DB.prepare("SELECT COUNT(*) AS n FROM timeline").first();
  expect(timeline.n).toBe(before.n);
});

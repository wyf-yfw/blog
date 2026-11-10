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

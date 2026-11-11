import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import { hashPassword } from "../worker/password.js";
import worker from "../worker/index.js";
import { resetDb } from "./helpers.js";

let cookie = "";

beforeEach(async () => {
  await resetDb();
  await env.DB.prepare(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)"
  ).bind("kris", await hashPassword("secret-pass"), "2026-11-10T00:00:00.000Z").run();
  const res = await worker.fetch(new Request("https://kris.test/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" },
    body: JSON.stringify({ username: "kris", password: "secret-pass" }),
  }), env);
  cookie = (res.headers.get("set-cookie") || "").split(";")[0];
});

function call(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (cookie) headers.set("cookie", cookie);
  if (options.body) headers.set("content-type", "application/json");
  return worker.fetch(new Request("https://kris.test" + path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  }), env);
}

test("没登录不能存草稿", async () => {
  const res = await worker.fetch(new Request("https://kris.test/api/admin/drafts/new", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "偷存" }),
  }), env);
  expect(res.status).toBe(401);
});

test("存草稿能读回来，再存会覆盖", async () => {
  const saved = await call("/api/admin/drafts/new", {
    method: "PUT",
    body: { title: "没写完", body: "第一段\n\n![图](/media/a.png)", category: "省察", tags: ["随笔"] },
  });
  expect(saved.status).toBe(200);

  const list = await call("/api/admin/drafts");
  const { items } = await list.json();
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ key: "new", title: "没写完", category: "省察", tags: ["随笔"] });
  expect(items[0].body).toContain("![图](/media/a.png)");

  await call("/api/admin/drafts/new", { method: "PUT", body: { title: "改了个标题", body: "第二版" } });
  const again = await (await call("/api/admin/drafts/new")).json();
  expect(again.title).toBe("改了个标题");
  expect(again.body).toBe("第二版");
});

test("草稿不会出现在公开内容里", async () => {
  await call("/api/admin/drafts/new", { method: "PUT", body: { title: "私密草稿", body: "draft" } });
  const site = await (await worker.fetch(new Request("https://kris.test/api/site"), env)).json();
  expect(site.articles).toHaveLength(0);
});

test("删掉草稿就没了", async () => {
  await call("/api/admin/drafts/new", { method: "PUT", body: { title: "临时" } });
  const del = await call("/api/admin/drafts/new", { method: "DELETE" });
  expect(del.status).toBe(200);
  const { items } = await (await call("/api/admin/drafts")).json();
  expect(items).toHaveLength(0);
});

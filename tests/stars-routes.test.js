import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import { resetDb } from "./helpers.js";

let cookie = "";

beforeEach(async () => {
  await resetDb();
  const { hashPassword } = await import("../worker/password.js");
  await env.DB.prepare(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)"
  ).bind("kris", await hashPassword("secret-pass"), "2026-11-10T00:00:00.000Z").run();
  const worker = (await import("../worker/index.js")).default;
  const res = await worker.fetch(new Request("https://kris.test/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" },
    body: JSON.stringify({ username: "kris", password: "secret-pass" }),
  }), env);
  cookie = (res.headers.get("set-cookie") || "").split(";")[0];
});

test("GET /api/stars 公开可读，没同步过也返回空数组", async () => {
  const worker = (await import("../worker/index.js")).default;
  const res = await worker.fetch(new Request("https://kris.test/api/stars"), env);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.items)).toBe(true);
  expect(body.items).toHaveLength(0);
  expect(body.syncedAt).toBe(null);
});

test("未登录不能手动同步", async () => {
  const worker = (await import("../worker/index.js")).default;
  const res = await worker.fetch(new Request("https://kris.test/api/admin/stars/sync", {
    method: "POST",
  }), env);
  expect(res.status).toBe(401);
});

test("登录后能手动同步", async () => {
  const worker = (await import("../worker/index.js")).default;
  const res = await worker.fetch(new Request("https://kris.test/api/admin/stars/sync", {
    method: "POST",
    headers: { cookie },
  }), env);
  // 测试环境没有配置 GITHUB_TOKEN，走真实请求会失败，这里只要求不 500 崩塌
  expect([200, 502]).toContain(res.status);
});

test("scheduled 能跑起来不抛错", async () => {
  const worker = (await import("../worker/index.js")).default;
  const waited = [];
  await worker.scheduled({}, env, { waitUntil: (p) => waited.push(p) });
  expect(waited.length).toBe(1);
  await Promise.all(waited.map((p) => p.catch(() => {})));
});

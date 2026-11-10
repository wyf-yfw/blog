import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import { hashPassword } from "../worker/password.js";
import worker from "../worker/index.js";
import { resetDb } from "./helpers.js";

beforeEach(async () => {
  await resetDb();
  await env.DB.prepare(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)"
  ).bind("kris", await hashPassword("secret-pass"), "2026-11-10T00:00:00.000Z").run();
});

function post(body, ip = "9.9.9.9") {
  return worker.fetch(new Request("https://kris.test/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  }), env);
}

test("错密码和不存在的用户名是同一句", async () => {
  const wrong = await post({ username: "kris", password: "nope" });
  const missing = await post({ username: "other", password: "secret-pass" }, "8.8.8.8");
  expect(wrong.status).toBe(401);
  expect(await wrong.json()).toEqual({ error: "unauthorized", hint: "账号或密码不对" });
  expect(await missing.json()).toEqual({ error: "unauthorized", hint: "账号或密码不对" });
});

test("登录后能读会话，退出后不能", async () => {
  const res = await post({ username: "kris", password: "secret-pass" });
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie");
  expect(cookie).toContain("kris_session=");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=Lax");
  expect(cookie).toContain("Path=/");
  expect(cookie).toContain("Max-Age=1209600");
  const token = cookie.split(";")[0];

  const me = await worker.fetch(new Request("https://kris.test/api/admin/session", {
    headers: { cookie: token },
  }), env);
  expect(await me.json()).toEqual({ username: "kris" });
  expect(me.headers.get("set-cookie")).toContain("kris_session=");

  const out = await worker.fetch(new Request("https://kris.test/api/admin/logout", {
    method: "POST",
    headers: { cookie: token },
  }), env);
  expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
  const again = await worker.fetch(new Request("https://kris.test/api/admin/session", {
    headers: { cookie: token },
  }), env);
  expect(again.status).toBe(401);
});

test("同一 IP 失败 5 次后被拦住", async () => {
  for (let i = 0; i < 5; i += 1) {
    expect((await post({ username: "kris", password: "bad" }, "7.7.7.7")).status).toBe(401);
  }
  const blocked = await post({ username: "kris", password: "secret-pass" }, "7.7.7.7");
  expect(blocked.status).toBe(429);
  expect(await blocked.json()).toEqual({ error: "rate_limited", hint: "试得太多了，稍后再来" });
});

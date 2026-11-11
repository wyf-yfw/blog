import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import worker from "../worker/index.js";
import { resetDb } from "./helpers.js";

beforeEach(() => resetDb());

function post(body, ip) {
  return worker.fetch(new Request("https://kris.test/api/links", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  }), env);
}

test("空库的友链是空名单", async () => {
  const res = await worker.fetch(new Request("https://kris.test/api/links"), env);
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.json()).toEqual({ items: [] });
});

test("没登录不能审核友链", async () => {
  const res = await worker.fetch(new Request("https://kris.test/api/admin/links/missing/approve", {
    method: "POST",
  }), env);
  expect(res.status).toBe(401);
});

test("坏网址、机器人字段和连点不会写进名单", async () => {
  const bad = await post({ name: "甲", url: "javascript:alert(1)" }, "203.0.113.20");
  expect(bad.status).toBe(400);
  const bot = await post({ name: "甲", url: "https://example.com", "bot-field": "spam" }, "203.0.113.21");
  expect(bot.status).toBe(200);
  const first = await post({ name: "甲", url: "https://example.com/1" }, "203.0.113.22");
  expect(first.status).toBe(200);
  const fast = await post({ name: "乙", url: "https://example.com/2" }, "203.0.113.22");
  expect(fast.status).toBe(429);
  const rows = await env.DB.prepare("SELECT name FROM links").all();
  expect(rows.results.map((row) => row.name)).toEqual(["甲"]);
});

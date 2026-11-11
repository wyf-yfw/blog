import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import worker from "../worker/index.js";
import { resetDb } from "./helpers.js";

beforeEach(() => resetDb());

test("旧的 Netlify 留言地址已经下线", async () => {
  const post = await worker.fetch(new Request("https://kris.test/.netlify/functions/guestbook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "甲", message: "还在" }),
  }), env);
  expect(post.status).toBe(404);

  const listed = await worker.fetch(new Request("https://kris.test/.netlify/functions/guestbook-list"), env);
  expect(listed.status).toBe(404);

  // 真正的留言接口还能用
  const real = await worker.fetch(new Request("https://kris.test/api/guestbook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" },
    body: JSON.stringify({ name: "甲", message: "还在" }),
  }), env);
  expect(real.status).toBe(200);
  expect((await real.json()).item).toMatchObject({ name: "甲", message: "还在" });
});

test("未知接口返回 JSON 404", async () => {
  const res = await worker.fetch(new Request("https://kris.test/api/nope"), env);
  expect(res.status).toBe(404);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.json()).toEqual({ error: "not_found", hint: "没有这个接口" });
});

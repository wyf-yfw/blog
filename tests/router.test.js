import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import worker from "../worker/index.js";
import { resetDb } from "./helpers.js";

beforeEach(() => resetDb());

test("旧留言地址仍然能写入", async () => {
  const res = await worker.fetch(new Request("https://kris.test/.netlify/functions/guestbook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" },
    body: JSON.stringify({ name: "甲", message: "还在" }),
  }), env);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.item).toMatchObject({ name: "甲", message: "还在" });

  const listed = await worker.fetch(new Request("https://kris.test/.netlify/functions/guestbook-list"), env);
  expect(listed.status).toBe(200);
  expect(await listed.json()).toMatchObject({ items: [expect.objectContaining({ message: "还在" })] });
});

test("未知接口返回 JSON 404", async () => {
  const res = await worker.fetch(new Request("https://kris.test/api/nope"), env);
  expect(res.status).toBe(404);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.json()).toEqual({ error: "not_found", hint: "没有这个接口" });
});

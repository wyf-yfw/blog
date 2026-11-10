import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import worker from "../worker/index.js";
import { resetDb } from "./helpers.js";

beforeEach(() => resetDb());

function post(body, ip) {
  return worker.fetch(new Request("https://kris.test/api/guestbook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  }), env);
}

test("空内容被拒绝，蜜罐不入库", async () => {
  const bad = await post({ name: "甲", message: "  " }, "1.1.1.1");
  expect(bad.status).toBe(400);
  expect(await bad.json()).toEqual({ error: "invalid", hint: "昵称和留言都要填" });

  const honey = await post({ name: "甲", message: "嗨", "bot-field": "x" }, "1.1.1.1");
  expect(await honey.json()).toEqual({ ok: true });
  const listed = await (await worker.fetch(new Request("https://kris.test/api/guestbook"), env)).json();
  expect(listed.items).toEqual([]);
});

test("15 秒内同一 IP 不能连发，别的 IP 可以", async () => {
  const first = await post({ name: "甲", message: "一" }, "1.1.1.1");
  expect(first.status).toBe(200);
  const second = await post({ name: "甲", message: "二" }, "1.1.1.1");
  expect(second.status).toBe(429);
  expect(await second.json()).toMatchObject({ hint: "发太快了，稍等几秒再试" });
  const other = await post({ name: "乙", message: "三" }, "2.2.2.2");
  expect(other.status).toBe(200);
});

test("只保留最新 200 条", async () => {
  const now = Date.now();
  for (let i = 0; i < 201; i += 1) {
    await env.DB.prepare(
      "INSERT INTO guestbook (id, name, message, created) VALUES (?, ?, ?, ?)"
    ).bind("g" + i, "甲", "m" + i, new Date(now + i).toISOString()).run();
  }
  await env.DB.prepare("DELETE FROM guestbook_limits").run();
  const res = await post({ name: "甲", message: "新" }, "3.3.3.3");
  const body = await res.json();
  expect(body.items).toHaveLength(200);
  expect(body.items[0].message).toBe("新");
  expect(body.items.some((item) => item.id === "g0")).toBe(false);
});

import { expect, test } from "vitest";
import { newId } from "../worker/ids.js";
import { hashPassword, verifyPassword } from "../worker/password.js";
import { shanghaiNow } from "../worker/time.js";

test("标识由时间前缀和随机段组成", () => {
  const id = newId();
  expect(id.length).toBeGreaterThan(8);
  expect(id).not.toBe(newId());
});

test("北京时间跨过 UTC 午夜仍算第二天", () => {
  const parts = shanghaiNow(new Date("2026-11-09T16:30:00.000Z"));
  expect(parts).toEqual({ date: "2026-11-10", stamp: "2026-11-10 00:30" });
});

test("密码哈希能校验，错密码不能通过", async () => {
  const stored = await hashPassword("correct horse");
  expect(stored.startsWith("pbkdf2-sha256$100000$")).toBe(true);
  expect(await verifyPassword("correct horse", stored)).toBe(true);
  expect(await verifyPassword("nope", stored)).toBe(false);
  expect(await verifyPassword("correct horse", "garbage")).toBe(false);
});

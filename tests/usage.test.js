import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import { hashPassword } from "../worker/password.js";
import worker from "../worker/index.js";
import { buildReport, classifyR2, nextDailyReset, nextMonthlyReset } from "../worker/usage.js";
import { resetDb } from "./helpers.js";

const now = new Date("2026-11-10T09:30:00.000Z");

test("每日额度在次日零点 UTC 清零", () => {
  expect(nextDailyReset(now)).toBe("2026-11-11T00:00:00.000Z");
  expect(nextDailyReset(new Date("2026-12-31T23:00:00.000Z"))).toBe("2027-01-01T00:00:00.000Z");
});

test("按月额度在下月一日零点 UTC 清零", () => {
  expect(nextMonthlyReset(now)).toBe("2026-12-01T00:00:00.000Z");
  expect(nextMonthlyReset(new Date("2026-12-31T23:00:00.000Z"))).toBe("2027-01-01T00:00:00.000Z");
});

test("R2 操作按文档分成 A 类、B 类和免费删除", () => {
  expect(classifyR2("PutObject")).toBe("a");
  expect(classifyR2("ListObjects")).toBe("a");
  expect(classifyR2("GetObject")).toBe("b");
  expect(classifyR2("HeadBucket")).toBe("b");
  expect(classifyR2("DeleteObject")).toBe("free");
  expect(classifyR2("SomethingNew")).toBe("other");
});

test("用量按账号合计，并算出剩余", () => {
  const groups = buildReport({
    workers: [
      { script: "kris", requests: 800, errors: 0, subrequests: 20, cpuP50: 2000, cpuP99: 11000 },
      { script: "other", requests: 200, errors: 1, subrequests: 5, cpuP50: 1000, cpuP99: 3000 },
    ],
    scripts: [{ id: "kris" }, { id: "other" }],
    databases: [
      { id: "1d2356f7-a066-4824-8024-ed5c1b96f6ae", name: "kris", bytes: 1000, rowsRead: 4000, rowsWritten: 100 },
      { id: "other-db", name: "maill_free_db", bytes: 500, rowsRead: 50, rowsWritten: 2 },
    ],
    r2: { bytes: 8500, objects: 3, classA: 9, classB: 51, free: 1, other: 2 },
    domains: [{ hostname: "kriswang.me" }, { hostname: "www.kriswang.me" }],
  }, now);
  const items = Object.fromEntries(groups.flatMap((group) => group.items.map((item) => [item.id, item])));

  expect(items["workers-requests"]).toMatchObject({
    used: 1000,
    limit: 100000,
    remaining: 99000,
    resetsAt: "2026-11-11T00:00:00.000Z",
  });
  expect(items["workers-requests"].detail).toContain("kris");
  expect(items["workers-requests"].detail).toContain("other");
  expect(items["workers-cpu"].limit).toBe(10);
  expect(items["workers-cpu"].kind).toBe("cap");
  expect(items["workers-cpu"].detail).toContain("11");
  expect(items["d1-reads"]).toMatchObject({ used: 4050, limit: 5000000, remaining: 4995950 });
  expect(items["d1-writes"]).toMatchObject({ used: 102, limit: 100000, remaining: 99898 });
  expect(items["d1-database"].used).toBe(1000);
  expect(items["d1-storage"].used).toBe(1500);
  expect(items["d1-count"]).toMatchObject({ used: 2, limit: 10, remaining: 8, resetsAt: null });
  expect(items["r2-class-a"]).toMatchObject({ used: 9, limit: 1000000, resetsAt: "2026-12-01T00:00:00.000Z" });
  expect(items["r2-class-b"].used).toBe(51);
  expect(items["r2-class-b"].detail).toContain("另有 2 次");
  expect(items["zone-domains"]).toMatchObject({ used: 2, limit: 100, remaining: 98 });
});

test("超过上限时剩余显示为零", () => {
  const groups = buildReport({
    workers: [{ script: "kris", requests: 200000, errors: 0, subrequests: 0 }],
    databases: [{ id: "1d2356f7-a066-4824-8024-ed5c1b96f6ae", name: "kris", bytes: 0, rowsRead: 9000000, rowsWritten: 0 }],
  }, now);
  const items = Object.fromEntries(groups.flatMap((group) => group.items.map((item) => [item.id, item])));
  expect(items["workers-requests"].remaining).toBe(0);
  expect(items["d1-reads"].remaining).toBe(0);
});

test("读不到用量时仍列出上限和清零时间", () => {
  const groups = buildReport({}, now);
  const items = Object.fromEntries(groups.flatMap((group) => group.items.map((item) => [item.id, item])));
  expect(items["workers-requests"]).toMatchObject({
    used: null,
    limit: 100000,
    remaining: null,
    resetsAt: "2026-11-11T00:00:00.000Z",
  });
  expect(items["r2-storage"].limit).toBe(10_000_000_000);
  expect(items["r2-egress"].kind).toBe("included");
  expect(JSON.stringify(groups)).not.toMatch(/refresh|oauth|Bearer|token/i);
});

beforeEach(resetDb);

test("未登录不能看额度", async () => {
  const res = await worker.fetch(new Request("https://kris.test/api/admin/usage"), env);
  expect(res.status).toBe(401);
});

test("登录后能看到免费额度目录", async () => {
  await env.DB.prepare(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)"
  ).bind("kris", await hashPassword("secret-pass"), "2026-11-10T00:00:00.000Z").run();
  const login = await worker.fetch(new Request("https://kris.test/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "kris", password: "secret-pass" }),
  }), env);
  const res = await worker.fetch(new Request("https://kris.test/api/admin/usage", {
    headers: { cookie: login.headers.get("set-cookie").split(";")[0] },
  }), env);
  expect(res.status).toBe(200);
  const body = await res.json();
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/refresh|oauth|Bearer/i);
  expect(body.groups.some((group) => group.items.some((item) => item.id === "workers-requests" && item.limit === 100000))).toBe(true);
  expect(body.notice).toContain("上限");
});

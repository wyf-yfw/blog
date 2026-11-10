import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import worker from "../worker/index.js";
import { resetDb } from "./helpers.js";

beforeEach(() => resetDb());

test("未知接口返回 JSON 404", async () => {
  const res = await worker.fetch(new Request("https://kris.test/api/nope"), env);
  expect(res.status).toBe(404);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.json()).toEqual({ error: "not_found", hint: "没有这个接口" });
});

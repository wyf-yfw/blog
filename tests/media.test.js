import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import { hashPassword } from "../worker/password.js";
import worker from "../worker/index.js";
import { resetDb } from "./helpers.js";

let cookie;

beforeEach(async () => {
  await resetDb();
  await env.DB.prepare(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)"
  ).bind("kris", await hashPassword("secret-pass"), "2026-11-10T00:00:00.000Z").run();
  const login = await worker.fetch(new Request("https://kris.test/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "kris", password: "secret-pass" }),
  }), env);
  cookie = login.headers.get("set-cookie").split(";")[0];
});

test("上传后能按地址读到原字节", async () => {
  const form = new FormData();
  const bytes = new Uint8Array([1, 2, 3, 4]);
  form.set("file", new File([bytes], "a.png", { type: "image/png" }));
  form.set("width", "12");
  form.set("height", "8");
  const saved = await worker.fetch(new Request("https://kris.test/api/admin/media", {
    method: "POST",
    headers: { cookie },
    body: form,
  }), env);
  expect(saved.status).toBe(200);
  const { url } = await saved.json();
  expect(url).toMatch(/^\/media\/.+\.png$/);
  const got = await worker.fetch(new Request("https://kris.test" + url), env);
  expect(got.status).toBe(200);
  expect(got.headers.get("content-type")).toContain("image/png");
  expect(new Uint8Array(await got.arrayBuffer())).toEqual(bytes);
});

test("拒绝非图片和未登录上传", async () => {
  const form = new FormData();
  form.set("file", new File(["hi"], "a.txt", { type: "text/plain" }));
  const bad = await worker.fetch(new Request("https://kris.test/api/admin/media", {
    method: "POST",
    headers: { cookie },
    body: form,
  }), env);
  expect(bad.status).toBe(400);
  expect(await bad.json()).toMatchObject({ hint: "这种图不能传" });

  const anon = await worker.fetch(new Request("https://kris.test/api/admin/media", {
    method: "POST",
    body: form,
  }), env);
  expect(anon.status).toBe(401);
});

test("没有的图是 404，登录后能删留言", async () => {
  const missing = await worker.fetch(new Request("https://kris.test/media/nope.png"), env);
  expect(missing.status).toBe(404);
  await env.DB.prepare(
    "INSERT INTO guestbook (id, name, message, created) VALUES ('m1', '甲', '嗨', '2026-11-10T00:00:00.000Z')"
  ).run();
  const removed = await worker.fetch(new Request("https://kris.test/api/admin/guestbook/m1", {
    method: "DELETE",
    headers: { cookie },
  }), env);
  expect(removed.status).toBe(200);
  const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM guestbook").first();
  expect(left.n).toBe(0);
});

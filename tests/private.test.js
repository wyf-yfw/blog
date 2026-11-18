import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import { hashPassword } from "../worker/password.js";
import worker from "../worker/index.js";
import { resetDb } from "./helpers.js";

const WORD = "章鱼";

beforeEach(async () => {
  await resetDb();
  await env.DB.prepare(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)"
  ).bind("kris", await hashPassword("secret-pass"), "2026-11-10T00:00:00.000Z").run();
});

async function admin(path, body, method = "POST") {
  const login = await worker.fetch(new Request("https://kris.test/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "kris", password: "secret-pass" }),
  }), env);
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  return worker.fetch(new Request("https://kris.test" + path, {
    method,
    headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), env);
}

test("密码页的内容不进公开站点和 RSS，密码对了才能读", async () => {
  expect((await admin("/api/admin/notes", { text: "公开的一句" })).status).toBe(200);
  expect((await admin("/api/admin/notes", { text: "只给你看", secret: true })).status).toBe(200);
  expect((await admin("/api/admin/articles", { title: "私信", body: "正文", secret: true })).status).toBe(200);

  const site = await (await worker.fetch(new Request("https://kris.test/api/site"), env)).json();
  expect(site.notes.map((n) => n.text)).toEqual(["公开的一句"]);
  expect(site.articles).toEqual([]);
  const xml = await (await worker.fetch(new Request("https://kris.test/rss.xml"), env)).text();
  expect(xml).toContain("公开的一句");
  expect(xml).not.toContain("只给你看");
  expect(xml).not.toContain("私信");

  const lines = await env.DB.prepare("SELECT text FROM timeline").all();
  const timeline = lines.results.map((row) => row.text).join("\n");
  expect(timeline).toContain("公开的一句");
  expect(timeline).not.toContain("只给你看");
  expect(timeline).not.toContain("私信");

  const locked = await worker.fetch(new Request("https://kris.test/api/private"), env);
  expect(locked.status).toBe(401);
  const wrong = await worker.fetch(new Request("https://kris.test/api/private", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "不是" }),
  }), env);
  expect(wrong.status).toBe(401);
  expect(await wrong.text()).not.toContain("只给你看");

  const opened = await worker.fetch(new Request("https://kris.test/api/private", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: WORD }),
  }), env);
  expect(opened.status).toBe(200);
  const cookie = (opened.headers.get("set-cookie") || "").split(";")[0];
  expect(cookie.startsWith("kris_lock=")).toBe(true);
  const room = await opened.json();
  expect(room.notes.map((n) => n.text)).toEqual(["只给你看"]);
  expect(room.articles.map((a) => a.title)).toEqual(["私信"]);
  expect(JSON.stringify(room)).not.toContain("公开的一句");

  const again = await worker.fetch(new Request("https://kris.test/api/private", { headers: { cookie } }), env);
  expect(again.status).toBe(200);
  const library = await (await admin("/api/admin/entries", null, "GET")).json();
  expect(library.notes.find((n) => n.text === "只给你看").secret).toBe(true);
  expect(library.notes.find((n) => n.text === "公开的一句").secret).toBe(false);

  const liked = await worker.fetch(new Request("https://kris.test/api/like", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "note", id: room.notes[0].id, visitor: "abcdefghijklmnop", on: true }),
  }), env);
  expect(liked.status).toBe(404);

  const bye = await worker.fetch(new Request("https://kris.test/api/private/logout", {
    method: "POST",
    headers: { cookie },
  }), env);
  expect(bye.status).toBe(200);
  const after = await worker.fetch(new Request("https://kris.test/api/private", { headers: { cookie } }), env);
  expect(after.status).toBe(401);
});

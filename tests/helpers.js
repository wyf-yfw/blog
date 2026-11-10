import schema from "../migrations/0001_init.sql?raw";
import { env } from "cloudflare:workers";

const TABLES = [
  "sessions", "articles", "notes", "about", "timeline",
  "guestbook", "guestbook_limits", "login_attempts", "media", "users",
];

export async function resetDb() {
  const parts = schema.split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean);
  for (const stmt of parts) await env.DB.prepare(stmt).run();
  for (const table of TABLES) await env.DB.prepare(`DELETE FROM ${table}`).run();
}

export async function api(path, options = {}) {
  const { worker } = await import("../worker/index.js");
  const headers = new Headers(options.headers || {});
  let body = options.body;
  if (body && typeof body === "object" && !(body instanceof FormData)) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(body);
  }
  const { env } = await import("cloudflare:workers");
  return worker.default.fetch(new Request("https://kris.test" + path, {
    method: options.method || "GET",
    headers,
    body,
  }), env);
}

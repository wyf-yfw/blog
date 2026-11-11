import schema from "../migrations/0001_init.sql?raw";
import viewsSchema from "../migrations/0002_views.sql?raw";
import draftsSchema from "../migrations/0003_drafts.sql?raw";
import starsSchema from "../migrations/0004_stars.sql?raw";
import goalsSchema from "../migrations/0005_goals.sql?raw";
import { env } from "cloudflare:workers";

const TABLES = [
  "sessions", "articles", "notes", "about", "timeline",
  "guestbook", "guestbook_limits", "login_attempts", "media", "users",
  "view_seen", "view_counts", "drafts", "stars", "stars_meta", "goals",
];

export async function resetDb() {
  const parts = (schema + "\n" + viewsSchema + "\n" + draftsSchema + "\n" + starsSchema + "\n" + goalsSchema).split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean);
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

import { syncStars } from "./stars.js";
import { handleContent } from "./admin-content.js";
import { handleUsage } from "./usage.js";
import { clientIp, sha256Hex } from "./guestbook.js";
import { fail, httpError, json, readJson } from "./http.js";
import { verifyPassword } from "./password.js";

const COOKIE = "kris_session";
const MAX_AGE = 14 * 24 * 60 * 60;
const WINDOW = 15 * 60 * 1000;

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function sessionCookie(token, maxAge) {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function readCookie(request) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=");
  }
  return "";
}

export async function requireSession(request, env, now = new Date()) {
  const token = readCookie(request);
  if (!token) throw httpError(401, "unauthorized", "先登录");
  const id = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT expires_at FROM sessions WHERE id = ?").bind(id).first();
  if (!row || row.expires_at <= now.toISOString()) {
    throw httpError(401, "unauthorized", "先登录");
  }
  const user = await env.DB.prepare("SELECT username FROM users LIMIT 1").first();
  if (!user) throw httpError(401, "unauthorized", "先登录");
  const expires = new Date(now.getTime() + MAX_AGE * 1000).toISOString();
  await env.DB.prepare("UPDATE sessions SET expires_at = ?, last_seen_at = ? WHERE id = ?")
    .bind(expires, now.toISOString(), id).run();
  return { username: user.username, token };
}

export function withSession(response, session) {
  if (!session) return response;
  const headers = new Headers(response.headers);
  headers.append("set-cookie", sessionCookie(session.token, MAX_AGE));
  return new Response(response.body, { status: response.status, headers });
}

async function tooMany(db, ipHash, now) {
  const row = await db.prepare(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ? AND failed_at > ?"
  ).bind(ipHash, now - WINDOW).first();
  return row && row.n >= 5;
}

export async function handleAdmin(request, env) {
  const path = new URL(request.url).pathname;
  const now = new Date();

  if (path === "/api/admin/login" && request.method === "POST") {
    const body = await readJson(request);
    const ipHash = await sha256Hex(clientIp(request));
    if (await tooMany(env.DB, ipHash, now.getTime())) {
      return fail(429, "rate_limited", "试得太多了，稍后再来");
    }
    const username = String(body.username || "");
    const password = String(body.password || "");
    const user = await env.DB.prepare(
      "SELECT username, password_hash FROM users WHERE username = ?"
    ).bind(username).first();
    const ok = user && await verifyPassword(password, user.password_hash);
    if (!ok) {
      await env.DB.prepare(
        "INSERT INTO login_attempts (ip_hash, failed_at) VALUES (?, ?)"
      ).bind(ipHash, now.getTime()).run();
      return fail(401, "unauthorized", "账号或密码不对");
    }
    await env.DB.prepare("DELETE FROM login_attempts WHERE ip_hash = ?").bind(ipHash).run();
    const token = newToken();
    const expires = new Date(now.getTime() + MAX_AGE * 1000).toISOString();
    await env.DB.prepare(
      "INSERT INTO sessions (id, expires_at, last_seen_at) VALUES (?, ?, ?)"
    ).bind(await sha256Hex(token), expires, now.toISOString()).run();
    return json({ username: user.username }, 200, { "set-cookie": sessionCookie(token, MAX_AGE) });
  }

  if (path === "/api/admin/logout" && request.method === "POST") {
    const token = readCookie(request);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256Hex(token)).run();
    return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
  }

  if (path === "/api/admin/session" && request.method === "GET") {
    const session = await requireSession(request, env, now);
    return withSession(json({ username: session.username }), session);
  }

  const session = await requireSession(request, env, now);
  if (path === "/api/admin/usage" && request.method === "GET") {
    return withSession(await handleUsage(env, now), session);
  }

  if (path === "/api/admin/stars/sync" && request.method === "POST") {
    const out = await syncStars(env);
    return withSession(json(out), session);
  }
  const content = await handleContent(request, env, session);
  if (content) return withSession(content, session);

  return fail(404, "not_found", "没有这个接口");
}

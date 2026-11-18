import { clientIp, sha256Hex } from "./guestbook.js";
import { fail, json, readJson } from "./http.js";
import { verifyPassword } from "./password.js";
import { getPrivate } from "./site.js";

const COOKIE = "kris_lock";
const MAX_AGE = 30 * 24 * 60 * 60;
const WINDOW = 15 * 60 * 1000;
const LOCK_HASH = "pbkdf2-sha256$100000$SVxfOwGqyZvvRoK3rAEf8w==$0H7mgSr5fWdaJMEMHiR+2DWLet8rjzTldNBj3Mkqv3I=";

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function cookie(token, maxAge) {
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

async function tooMany(db, ipHash, now) {
  const row = await db.prepare(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ? AND failed_at > ?"
  ).bind(ipHash, now - WINDOW).first();
  return row && row.n >= 8;
}

async function openSession(request, env, now) {
  const token = readCookie(request);
  if (!token) return "";
  const id = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT expires_at FROM lock_sessions WHERE id = ?").bind(id).first();
  if (!row || row.expires_at <= now.toISOString()) return "";
  return token;
}

export async function handlePrivate(request, env) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  const now = new Date();

  if (path === "/api/private/logout" && request.method === "POST") {
    const token = readCookie(request);
    if (token) {
      await env.DB.prepare("DELETE FROM lock_sessions WHERE id = ?").bind(await sha256Hex(token)).run();
    }
    return json({ ok: true }, 200, { "set-cookie": cookie("", 0) });
  }

  if (path !== "/api/private") return fail(404, "not_found", "没有这个接口");

  if (request.method === "GET") {
    if (!await openSession(request, env, now)) return fail(401, "unauthorized", "先输入密码");
    return json(await getPrivate(env.DB));
  }

  if (request.method !== "POST") return fail(405, "method_not_allowed", "不支持这个方法");

  const ipHash = await sha256Hex("lock\n" + clientIp(request));
  if (await tooMany(env.DB, ipHash, now.getTime())) {
    return fail(429, "rate_limited", "试得太多了，稍后再来");
  }
  const body = await readJson(request);
  const ok = await verifyPassword(String(body.password || "").trim().toLowerCase(), LOCK_HASH);
  if (!ok) {
    await env.DB.prepare(
      "INSERT INTO login_attempts (ip_hash, failed_at) VALUES (?, ?)"
    ).bind(ipHash, now.getTime()).run();
    return fail(401, "unauthorized", "密码不对");
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE ip_hash = ?").bind(ipHash).run();
  const token = newToken();
  const expires = new Date(now.getTime() + MAX_AGE * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO lock_sessions (id, expires_at) VALUES (?, ?)"
  ).bind(await sha256Hex(token), expires).run();
  return json(await getPrivate(env.DB), 200, { "set-cookie": cookie(token, MAX_AGE) });
}

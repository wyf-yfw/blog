import { requireSession, withSession } from "./auth.js";
import { fail, json } from "./http.js";
import { newId } from "./ids.js";

const TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX = 8 * 1024 * 1024;

function safeKey(raw) {
  const key = decodeURIComponent(raw);
  if (!key || key.includes("/") || key.includes("..")) return "";
  return key;
}

export async function handleMedia(request, env) {
  if (request.method !== "GET") return fail(405, "method_not_allowed", "不支持这个方法");
  const key = safeKey(new URL(request.url).pathname.slice("/media/".length));
  if (!key) return fail(404, "not_found", "没有这张图");
  const obj = await env.MEDIA.get(key);
  if (!obj) return fail(404, "not_found", "没有这张图");
  const headers = new Headers();
  headers.set("content-type", obj.httpMetadata?.contentType || "application/octet-stream");
  headers.set("cache-control", "public, max-age=604800");
  return new Response(obj.body, { headers });
}

export async function handleUpload(request, env) {
  const session = await requireSession(request, env);
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return withSession(fail(400, "invalid", "先选一张图"), session);
  const ext = TYPES[file.type];
  if (!ext) return withSession(fail(400, "invalid", "这种图不能传"), session);
  if (file.size > MAX) return withSession(fail(400, "invalid", "图片太大了"), session);
  const key = `${newId()}.${ext}`;
  await env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  const width = Number(form.get("width"));
  const height = Number(form.get("height"));
  await env.DB.prepare(
    "INSERT INTO media (key, content_type, width, height, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(
    key,
    file.type,
    Number.isInteger(width) ? width : null,
    Number.isInteger(height) ? height : null,
    new Date().toISOString()
  ).run();
  return withSession(json({ url: "/media/" + key }), session);
}

import { handleAdmin } from "./auth.js";
import { handleGuestbook } from "./guestbook.js";
import { fail } from "./http.js";
import { handleMedia, handleUpload } from "./media.js";
import { handleSite } from "./site.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/api/site") return await handleSite(request, env);
      if (path === "/api/guestbook") return await handleGuestbook(request, env);
      if (path === "/api/admin/media" && request.method === "POST") return await handleUpload(request, env);
      if (path.startsWith("/api/admin/")) return await handleAdmin(request, env);
      if (path.startsWith("/media/")) return await handleMedia(request, env);
      if (path.startsWith("/api/")) return fail(404, "not_found", "没有这个接口");
      return await env.ASSETS.fetch(request);
    } catch (err) {
      if (err && err.status) return fail(err.status, err.code || "internal", err.hint || "服务器出错了");
      return fail(500, "internal", "服务器出错了");
    }
  },
};

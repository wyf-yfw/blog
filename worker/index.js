import { handleAdmin } from "./auth.js";
import { handleGuestbook } from "./guestbook.js";
import { fail } from "./http.js";
import { handleMedia, handleUpload } from "./media.js";
import { handleLinks } from "./links.js";
import { handleSite } from "./site.js";
import { handleStars, syncStars } from "./stars.js";
import { handleLike } from "./likes.js";
import { handleView } from "./views.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path === "/api/site") return await handleSite(request, env);
      if (path === "/api/guestbook") {
        return await handleGuestbook(request, env);
      }
      if (path === "/api/stars") return await handleStars(env);
      if (path === "/api/links") return await handleLinks(request, env);
      if (path === "/api/view") return await handleView(request, env);
      if (path === "/api/like") return await handleLike(request, env);
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

  // 每天一次，把 GitHub star 同步进 D1
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncStars(env).catch(() => {}));
  },
};

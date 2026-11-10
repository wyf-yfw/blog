import { fail } from "./http.js";
import { handleSite } from "./site.js";

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    try {
      if (path === "/api/site") return handleSite(request, env);
      if (path.startsWith("/api/") || path.startsWith("/media/")) {
        return fail(404, "not_found", "没有这个接口");
      }
      return env.ASSETS.fetch(request);
    } catch (err) {
      if (err && err.status) return fail(err.status, err.code || "internal", err.hint || "服务器出错了");
      return fail(500, "internal", "服务器出错了");
    }
  },
};

/* GitHub star 快照：定时同步进 D1，页面只读这张表 */
import { httpError, json } from "./http.js";

const USER = "wyf-yfw";
const LIST_URL =
  "https://api.github.com/users/" + USER + "/starred?per_page=100&sort=created&direction=desc";

function toStar(entry, fallbackAt) {
  const repo = (entry && entry.repo) || entry || {};
  const full = String(repo.full_name || "");
  const [ownerFromFull, nameFromFull] = full.split("/");
  const owner = (repo.owner && repo.owner.login) || ownerFromFull || "";
  const name = repo.name || nameFromFull || "";
  return {
    repo: full || owner + "/" + name,
    name,
    owner,
    description: repo.description || "",
    language: repo.language || "",
    stars: Number(repo.stargazers_count) || 0,
    url: repo.html_url || "https://github.com/" + (full || owner + "/" + name),
    starredAt: (entry && entry.starred_at) || fallbackAt,
  };
}

async function noteSync(env, ts, okFlag, message) {
  await env.DB.prepare(
    `INSERT INTO stars_meta (id, synced_at, ok, message)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       synced_at = excluded.synced_at, ok = excluded.ok, message = excluded.message`
  ).bind(ts, okFlag, message || "").run();
}

export async function syncStars(env, fetchImpl = fetch) {
  const ts = new Date().toISOString();
  const headers = {
    accept: "application/vnd.github.star+json",
    "user-agent": "kris-site",
  };
  if (env.GITHUB_TOKEN) headers.authorization = "Bearer " + env.GITHUB_TOKEN;

  const res = await fetchImpl(LIST_URL, { headers });
  if (!res.ok) {
    const message = "GitHub 返回 " + res.status;
    await noteSync(env, ts, 0, message);
    throw httpError(502, "github", message);
  }

  const list = await res.json();
  const items = (Array.isArray(list) ? list : []).map((entry) => toStar(entry, ts));

  const statements = [env.DB.prepare("DELETE FROM stars")];
  for (const item of items) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO stars (repo, payload, starred_at, synced_at) VALUES (?, ?, ?, ?)"
      ).bind(item.repo, JSON.stringify(item), item.starredAt, ts)
    );
  }
  await env.DB.batch(statements);
  await noteSync(env, ts, 1, "");

  return { count: items.length, syncedAt: ts };
}

export async function handleStars(env) {
  const { results } = await env.DB.prepare(
    "SELECT payload FROM stars ORDER BY starred_at DESC"
  ).all();
  const meta = await env.DB.prepare(
    "SELECT synced_at, ok, message FROM stars_meta WHERE id = 1"
  ).first();

  return json({
    items: (results || []).map((row) => JSON.parse(row.payload)),
    syncedAt: meta ? meta.synced_at : null,
    ok: meta ? Boolean(meta.ok) : false,
    message: meta ? meta.message : "",
  });
}

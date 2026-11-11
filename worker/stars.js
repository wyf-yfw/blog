/* GitHub star 快照：定时同步进 D1，页面只读这张表 */
import { httpError, json } from "./http.js";

const USER = "wyf-yfw";
const PER_PAGE = 100;
const MAX_PAGES = 20;
const LIST_URL =
  "https://api.github.com/users/" + USER + "/starred?per_page=" + PER_PAGE + "&sort=created&direction=desc";

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

async function collectStars(fetchImpl, headers) {
  const entries = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchImpl(LIST_URL + "&page=" + page, { headers });
    if (!res.ok) throw httpError(502, "github", "GitHub 返回 " + res.status);
    const list = await res.json();
    if (!Array.isArray(list)) throw httpError(502, "github", "GitHub 返回的不是列表");
    entries.push(...list);
    if (list.length < PER_PAGE) return entries;
  }
  throw httpError(502, "github", "收藏太多，这次没有全部同步");
}

export async function syncStars(env, fetchImpl = fetch) {
  const ts = new Date().toISOString();
  const headers = {
    accept: "application/vnd.github.star+json",
    "user-agent": "kris-site",
  };
  if (env.GITHUB_TOKEN) headers.authorization = "Bearer " + env.GITHUB_TOKEN;

  let entries;
  try {
    entries = await collectStars(fetchImpl, headers);
  } catch (err) {
    const message = (err && err.hint) || "同步时出错了";
    await noteSync(env, ts, 0, message);
    if (err && err.status) throw err;
    throw httpError(502, "github", message);
  }

  const items = entries.map((entry) => toStar(entry, ts));

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

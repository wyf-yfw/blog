# GitHub Star 页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每天自动把 `wyf-yfw` 的 GitHub star 同步到 D1，公开页 `/stars` 只读 D1 展示。

**Architecture:** Worker 定时任务拉 GitHub → 覆盖写 D1 `stars` 表 → 页面读 `/api/stars`。页面与 GitHub 完全解耦，同步失败保留上一份快照。

**Tech Stack:** Cloudflare Workers + D1 + Cron Triggers，wrangler 4，vitest（`@cloudflare/vitest-plugin`）。

**Spec:** `docs/superpowers/specs/2026-11-11-stars-page-design.md`

## Global Constraints

- 仓库账号固定为 `wyf-yfw`，写在 `worker/stars.js` 的常量里
- GitHub 请求必须带 `Accept: application/vnd.github.star+json`（只有这个 media type 会返回 `starred_at`）
- 响应是 `[{ starred_at, repo: {...} }]`；没有该 media type 时是裸 repo 数组，解析要兼容两种
- 有 `env.GITHUB_TOKEN` 就带 `Authorization: Bearer ...`，没有就不带（可能 403，要能优雅失败）
- 同步是**整体覆盖**：先删后插，仓库被取消 star 后要消失
- 同步失败时**不改动已有数据**
- 所有新增接口错误返回都用 `fail()`，成功用 `json()`
- 中文文案，与站内现有措辞一致

## Review Focus

- **GitHub 403/401**（限流、token 失效）：必须保留旧快照，`/api/stars` 仍能返回上一次成功的数据，`ok:false` 带原因
- **仓库被取消 star**：下次同步后该条应从列表消失（覆盖写）
- **`description` / `language` 为 null**：页面不能出现 "null" 字样
- **`starred_at` 缺失**（兼容模式）：不能抛错，按同步时间兜底
- **Cron 与手动同步并发**：两次覆盖写不能留下重复行（主键 `repo` 保证）

---

### Task 1: stars 表 + 同步与读取逻辑

**Files:**
- Create: `migrations/0004_stars.sql`
- Create: `worker/stars.js`
- Modify: `tests/helpers.js`（把新表加进建表与清表列表）
- Test: `tests/stars.test.js`

**Interfaces:**
- Produces:
  - `syncStars(env, fetchImpl = fetch) -> Promise<{ count: number, syncedAt: string }>`
  - `handleStars(env) -> Promise<Response>`，JSON 形如 `{ items: Star[], syncedAt: string|null, ok: boolean, message: string }`
  - `Star = { repo: string, name: string, owner: string, description: string, language: string, stars: number, url: string, starredAt: string }`

- [ ] **Step 1: 写迁移**

`migrations/0004_stars.sql`：

```sql
CREATE TABLE IF NOT EXISTS stars (
  repo TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  starred_at TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stars_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  synced_at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  message TEXT NOT NULL DEFAULT ''
);
```

- [ ] **Step 2: 把新表接入测试库**

`tests/helpers.js`：`import starsSchema from "../migrations/0004_stars.sql?raw";`，建表语句后拼上 `starsSchema`，`TABLES` 数组加上 `"stars", "stars_meta"`。

- [ ] **Step 3: 写失败测试**

`tests/stars.test.js` 覆盖四个行为：

```js
// 1) 正常同步写入并返回条数
// 2) GitHub 403 时抛错，且旧数据仍在
// 3) 第二次同步会删掉已取消 star 的仓库
// 4) description/language 为 null 时返回空串
```

用 `fetchImpl` 注入假响应，形如：

```js
const fake = async () => new Response(JSON.stringify([
  { starred_at: "2026-11-01T10:00:00Z", repo: { full_name: "a/b", name: "b", owner: { login: "a" }, description: null, language: null, stargazers_count: 12, html_url: "https://github.com/a/b" } }
]), { status: 200 });
```

- [ ] **Step 4: 跑测试确认失败**

Run: `npx vitest run tests/stars.test.js`
Expected: FAIL，`syncStars is not a function` 或表不存在

- [ ] **Step 5: 实现 `worker/stars.js`**

要点：
- `const USER = "wyf-yfw"`，URL `https://api.github.com/users/${USER}/starred?per_page=100&sort=created&direction=desc`
- `const res = await fetchImpl(url, { headers })`；`!res.ok` 时写 `stars_meta`（ok=0, message=`GitHub 返回 ${res.status}`）后 `throw httpError(502, "github", ...)`
- 数组元素取 `entry.repo || entry`，`starred_at` 取 `entry.starred_at || 同步时间`
- 成功时：`DELETE FROM stars` → 逐条 `INSERT` → 写 `stars_meta`（ok=1）
- `handleStars` 读 `stars`（按 `starred_at` 倒序）与 `stars_meta`，返回上面的形状

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run tests/stars.test.js`
Expected: PASS，4 个用例

- [ ] **Step 7: 提交**

```bash
git add migrations/0004_stars.sql worker/stars.js tests/helpers.js tests/stars.test.js
git commit -m "feat(stars): D1 存 GitHub star 快照，同步失败保留旧数据"
```

---

### Task 2: 路由与定时任务

**Files:**
- Modify: `worker/index.js`（加 `GET /api/stars` 与 `scheduled`）
- Modify: `worker/auth.js`（加 `POST /api/admin/stars/sync`）
- Modify: `wrangler.jsonc`（加 `triggers.crons`）
- Test: `tests/stars-routes.test.js`

**Interfaces:**
- Consumes: Task 1 的 `syncStars`、`handleStars`
- Produces: `GET /api/stars`、`POST /api/admin/stars/sync`（需登录）、`worker.scheduled(event, env, ctx)`

- [ ] **Step 1: 写失败测试**

```js
// GET /api/stars → 200，body 有 items 数组
// POST /api/admin/stars/sync 未登录 → 401
// 登录后 POST → 200，body.count 是数字
// worker.scheduled({}, env, { waitUntil }) 不抛错
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/stars-routes.test.js`
Expected: FAIL，404

- [ ] **Step 3: 接线路由**

`worker/index.js`：
- `if (path === "/api/stars") return await handleStars(env);`（放在 `/api/` 404 之前）
- 导出 `async scheduled(event, env, ctx) { ctx.waitUntil(syncStars(env).catch(() => {})); }`

`worker/auth.js`：会话校验之后加

```js
if (path === "/api/admin/stars/sync" && request.method === "POST") {
  const out = await syncStars(env);
  return withSession(json(out), session);
}
```

`wrangler.jsonc` 顶层加 `"triggers": { "crons": ["0 3 * * *"] }`（UTC 3 点 = 北京 11 点）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/stars-routes.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add worker/index.js worker/auth.js wrangler.jsonc tests/stars-routes.test.js
git commit -m "feat(stars): 暴露 /api/stars 与手动同步接口，挂每日 Cron"
```

---

### Task 3: 公开页 /stars

**Files:**
- Create: `stars.html`
- Create: `assets/js/stars.js`
- Modify: `assets/css/style.css`（列表样式，复用现有条目样式优先）
- Modify: 全部 8 个 html 的导航（加「推荐」）
- Test: 手工验证 `npx vitest run` 全绿 + 浏览器截图

**Interfaces:**
- Consumes: `GET /api/stars`

- [ ] **Step 1: 建页面骨架**

照抄 `timeline.html` 的 head / 导航 / 页脚结构，`<body data-page="stars">`，标题「推荐」，正文容器 `<div class="wrap"><div class="page-head">…</div><div data-stars></div><p class="empty">还没有同步过。</p></div>`，引入 `assets/js/stars.js?v=20261111e`。导航里加 `<a class="nav__link" href="stars.html">推荐</a>`（放在「时间线」之前），其余页面同步加。

- [ ] **Step 2: 写渲染脚本**

`assets/js/stars.js`：`fetch("/api/stars")` → 每条渲染成一行

```html
<a class="star" href="{url}" target="_blank" rel="noopener">
  <span class="star__repo">{repo}</span>
  <span class="star__desc">{description}</span>
  <span class="star__meta">{language} · ★ {stars}</span>
</a>
```

- `description` / `language` 为空时整段省略，不要输出 "null"
- 顶部一排语言筛选按钮（`全部` + 出现过的语言），点击按语言过滤
- 拿到数据后把 `syncedAt` 写进页脚一行小字：「同步于 2026-11-11 11:00」
- 请求失败或 items 为空：显示 `.empty`，不报错

- [ ] **Step 3: 样式**

沿用现有发丝线 + 等宽元信息的语汇：条目 `border-top: 1px solid var(--line)`，仓库名用等宽字体，描述用正文字体，右侧元信息淡色。

- [ ] **Step 4: 验证**

Run: `npx vitest run`（应仍全绿）
再用本地静态服务 + 假 `/api/stars` 截图确认桌面/手机都不溢出。

- [ ] **Step 5: 提交**

```bash
git add stars.html assets/js/stars.js assets/css/style.css *.html
git commit -m "feat(stars): 新增推荐页 /stars"
```

---

### Task 4: 后台「推荐」tab

**Files:**
- Modify: `admin.html`（tab 按钮 + section）
- Modify: `assets/js/admin-app.js`（渲染同步状态与「立即同步」）
- Test: 手工验证

**Interfaces:**
- Consumes: `GET /api/stars`（含 `syncedAt` / `ok` / `message`）、`POST /api/admin/stars/sync`

- [ ] **Step 1: 加 tab**

`admin.html` 的 tablist 里加 `<button type="button" role="tab" data-tab="stars" aria-selected="false">推荐</button>`，并在面板区加 `<section class="desk__sec" data-panel="stars" hidden></section>`。

- [ ] **Step 2: 渲染面板**

`admin-app.js` 里加 `renderStars()`：显示「上次同步：2026-11-11 11:00 · 共 35 个」，同步失败时显示原因（偏红），加一个「立即同步」按钮，点击后 `POST /api/admin/stars/sync`，成功刷新面板并提示「同步完成」，失败提示错误。在 `load()` 里调用。

- [ ] **Step 3: 验证**

后台登录后切到「推荐」tab，点「立即同步」，确认计数与时间更新。

- [ ] **Step 4: 提交**

```bash
git add admin.html assets/js/admin-app.js
git commit -m "feat(stars): 后台推荐 tab，可查看同步状态并手动同步"
```

---

### Task 5: 上线

- [ ] **Step 1: 远端建表**：`npx wrangler d1 migrations apply kris --remote`
- [ ] **Step 2: 配 token**：`npx wrangler secret put GITHUB_TOKEN`（经典 token 不勾 scope 即可读公开信息）
- [ ] **Step 3: 推送 main**，等 GitHub Actions 跑完
- [ ] **Step 4: 手动触发一次同步**，确认 `/api/stars` 有 35 条
- [ ] **Step 5: 打开 https://kriswang.me/stars 确认**

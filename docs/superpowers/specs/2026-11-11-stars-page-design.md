# GitHub Star 页（每日同步）

## 意图

把 GitHub 上的 star 当作推荐来源：不用手写内容，每天自动同步一份快照到 D1，访客从自己的站读，不直接访问 GitHub。

现状：站上已有 D1 + Worker + Cron 能力（wrangler.jsonc 还没有 triggers）。
`wyf-yfw` 目前 star 了 35 个仓库，`/users/wyf-yfw/starred?per_page=100` 一次可取完。

## 目标

- 新页面 `/stars` 展示全部 star，按 star 时间倒序
- 每天自动同步一次到 D1，无人值守
- 页面零外部依赖：GitHub 挂了、限流了、token 过期，页面照常打开，只是数据旧

## 非目标

- 不做手动增删改（只收录 star 出来的东西）
- 不做实时（最多旧 24 小时，可接受）
- 不做星数历史曲线，只存最近一次快照

## 约束

- GitHub 未登录接口 60 次/小时且按 IP 计；Cloudflare 出口 IP 共享，容易 403。所以同步优先用 `GITHUB_TOKEN`（5000 次/小时）
- 没有 token 时同步很可能失败，失败要留痕，不能让页面空掉

## 方案

**采用：Cron 每日同步 → D1 → 页面读 `/api/stars`。**

其他两种不考虑：
- 页面每次实时转发 GitHub：把可用性押在外部接口和额度上，还会让首屏变慢
- 前端直连 GitHub：CORS + 限流 + 要把 token 发到浏览器，不可行

## 设计

- `migrations/0004_stars.sql`：`stars(repo TEXT PRIMARY KEY, payload TEXT, starred_at TEXT, synced_at TEXT)`
- `worker/stars.js`
  - `syncStars(env)`：拉 `/users/wyf-yfw/starred?per_page=100&sort=created`，整体覆盖写入；失败抛错并把原因记到 `stars_meta`
  - `handleStars(env)`：读 D1，返回 `{ items, syncedAt }`
- `worker/index.js`：`GET /api/stars`；`POST /api/admin/stars/sync`（登录后手动补一次）
- `wrangler.jsonc`：`triggers.crons = ["0 3 * * *"]`（UTC 3 点 = 北京时间 11 点），`worker/index.js` 增加 `scheduled()` → `syncStars`
- `stars.html` + `assets/js/stars.js`：每条一行（仓库名、描述、语言、星数），顶部按语言筛选
- 后台加「推荐」tab，显示上次同步时间和一个「立即同步」按钮
- 全站导航加「推荐」入口

## 决定（我的判断，可推翻）

- 自己的两个仓库照实列出，不特殊处理
- 只读 star，不提供手动补录（以后要做再加）
- 同步失败时保留上一份数据，只在后台显示失败原因

## 留给实现

- 排版细节、语言筛选的交互形态

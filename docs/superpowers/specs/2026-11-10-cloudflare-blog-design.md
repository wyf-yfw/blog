# Kris 迁到 Cloudflare

日期：2026-11-10

把个人站 Kris 放到 Cloudflare 免费额度上。公开页面保持现在的外观和阅读方式。文章、手记、关于、时间线、留言存在 D1。插图存在 R2。编辑收成单独的 `/admin`，用一个账号和密码登录。

## 已定的范围

- 一个 Worker 同时托管现有静态页，并处理 `/api` 与 `/media`。
- 公开页继续由浏览器按接口数据渲染。
- 照片墙不恢复。图片只作为文章和手记里的插图。
- 公开页去掉页内编辑和 `Ctrl+Shift+E`。
- 后台只有一个账号。密码以哈希存在数据库里。
- 现有关于文字、两篇手记、三条时间线，以及手记里已有的那张图，上线时导入。
- 先在 `*.workers.dev` 上核对，再把 `kriswang.me` 接到这个 Worker。

不做的事：用框架重写前后台、由 Worker 直接输出整页 HTML、把内容继续写回 `content/site.json`、在后台页里改密码。

## 架构

```
公开页  -- GET /api/site --------> Worker --> D1
留言页  -- GET/POST /api/guestbook -> Worker --> D1
图片    -- GET /media/:key ------> Worker --> R2
/admin  -- 登录后的写接口 -------> Worker --> D1 / R2
其余路径 -----------------------> 静态文件
```

资源命名：

| 资源 | 名称 |
|---|---|
| Worker | `kris` |
| D1 | `kris` |
| R2 | `kris-media` |
| 会话 cookie | `kris_session` |

`/api/*` 和 `/media/*` 进入 Worker。其余路径按静态资源返回。

## 数据

标识沿用现在的做法：当前毫秒的 36 进制再加上一段随机字符。导入的旧标识原样保留。

`users`：唯一后台账号。`username` 唯一。`password_hash` 的形式是 `pbkdf2-sha256$<迭代次数>$<盐>$<哈希>`，迭代 100000 次，用 Web Crypto 的 PBKDF2-SHA-256。

`sessions`：`id` 是令牌的 SHA-256 十六进制，不存令牌原文。另有 `expires_at`、`last_seen_at`。允许多个未过期会话并存。退出只删除当前 cookie 对应的那一条。

`articles`：`id`、`date`（`YYYY-MM-DD`）、`title`、`excerpt`、`category`、`tags`（JSON 字符串数组）、`minutes`（空或 1–99 的整数）、`body`、`created_at`、`updated_at`。类别只允许 `学记`、`省察`、`所见`、`存档`。

`notes`：`id`、`date`、`text`、`tags`、`created_at`、`updated_at`。

`about`：固定一行。`paragraphs` 是 JSON 字符串数组。

`timeline`：`id`、`date`（`YYYY-MM-DD HH:mm`）、`text`、`kind`（`article`、`note`、`about`）。接口按时间从新到旧返回，最多 200 条。同一种 `kind` 且 `text` 与最新一条相同，只更新那一条的时间。删除时间线不再追加记录。

`guestbook`：`id`、`name`、`message`、`created`（ISO 时间）。最多保留最新 200 条。

`guestbook_limits`：`ip_hash`、`last_at`。`ip_hash` 是 IP 的 SHA-256，不存原始 IP。

`login_attempts`：`ip_hash`、`failed_at`。

`media`：`key`（主键）、`content_type`、`width`、`height`、`created_at`。对象放在 R2 的同一键下。

时间线文案由写接口生成，页面不自己拼：

| 动作 | 文案 |
|---|---|
| 新建文章 | `发布了文章：` + 标题 |
| 更新文章 | `更新了文章：` + 标题 |
| 删除文章 | `删除了文章：` + 标题，标题截到 40 字 |
| 新建手记 | `记了一笔手记：` + 正文前 40 字 |
| 更新手记 | `更新了手记：` + 正文前 40 字 |
| 删除手记 | `删除了手记：` + 正文前 40 字 |
| 更新关于 | `更新了关于` |

## 接口

失败时正文为 `{ "error": "<代码>", "hint": "<给人看的短句>" }`。

公开接口不需要登录，响应 `Cache-Control: no-store`。

- `GET /api/site`  
  `{ about: { paragraphs }, articles, notes, timeline }`。文章和手记返回全部，排序仍由现有页面脚本负责。时间线已按新到旧排好。
- `GET /api/guestbook`  
  `{ items }`，新的在前。
- `POST /api/guestbook`  
  JSON：`name`、`message`、`bot-field`。蜜罐非空时返回 `{ ok: true }` 且不入库。昵称去掉首尾空白后 1–40 字，内容 1–1000 字，否则 400，`hint` 为「昵称和留言都要填」。同一 IP 15 秒内再次提交返回 429。成功时 `{ ok: true, item, items }`。
- `GET /media/:key`  
  返回对象内容和类型。没有这个对象时 404。

后台接口除登录外都要有效会话，否则 401。每次通过鉴权时，把该会话的 `expires_at` 延到 14 天后，并在响应里重新写下 cookie，让浏览器侧的有效期一起延长。

- `POST /api/admin/login`  
  `{ username, password }`。成功时设置 cookie 并返回 `{ username }`。用户名或密码不对都返回 401，`hint` 为「账号或密码不对」。同一 IP 在 15 分钟内失败 5 次后返回 429，`hint` 为「试得太多了，稍后再来」。登录成功后清掉该 IP 的失败记录。
- `POST /api/admin/logout`  
  删除当前会话并清除 cookie。
- `GET /api/admin/session`  
  已登录返回 `{ username }`。
- `POST /api/admin/articles`、`PUT /api/admin/articles/:id`、`DELETE /api/admin/articles/:id`
- `POST /api/admin/notes`、`PUT /api/admin/notes/:id`、`DELETE /api/admin/notes/:id`
- `PUT /api/admin/about`  
  `{ paragraphs: string[] }`。空数组成空的关于页。
- `DELETE /api/admin/timeline/:id`
- `POST /api/admin/media`  
  `multipart/form-data`，字段名 `file`。接受 jpeg、png、webp、gif，最大 8 MB。写入 R2 和 `media` 表，返回 `{ url }`，`url` 形如 `/media/<key>`。
- `DELETE /api/admin/guestbook/:id`

文章和手记的请求体使用与字段同名的 JSON。`tags` 在接口里是字符串数组，写入数据库时再变成 JSON 字符串。新建时由服务器生成 `id`；日期省略时用北京时间的当天。文章要求标题非空、类别在允许列表内、摘要不超过 200 字、日期为 `YYYY-MM-DD`。阅读分钟留空则存空。手记要求正文去掉空白后非空。关于接口里的 `paragraphs` 也是字符串数组。

Cookie：`HttpOnly`、`Secure`、`SameSite=Lax`、`Path=/`，有效期与会话一致。令牌是 32 字节随机数。

## 账号初始化

本机命令交互式询问用户名和密码，密码不作为命令行参数。命令计算哈希，写入或替换 `users` 里唯一的那一行。密码不进入仓库，也不进入前端。后台页面不提供改密码；要换密码就再跑一次这个命令。

## 后台页

`/admin` 使用现有样式，主导航不放入口。

未登录只显示用户名和密码。已登录时同一页包含：

- 文章列表，以及新建、编辑、删除。字段为日期、标题、摘要、类别、标签、阅读分钟、正文。
- 手记列表，以及新建、编辑、删除。字段为日期、正文、标签。
- 关于：一个文本框，连续空行分段。
- 时间线：列表和删除。
- 留言：列表和删除。
- 退出。

正文插图保留三种入口：选择文件、粘贴、拖进输入框。上传前把最长边压到 1600 像素。上传成功后插入 `![说明](/media/…)`。保存成功后停留在后台，并提示已经生效。

打开页面时请求 `GET /api/admin/session`。401 时显示登录表单。写操作遇到 401 时清掉本地登录状态并回到登录表单。

## 公开页

`site.js` 改为请求 `GET /api/site`。渲染、分类、标签、正文标记和空状态保持现状。接口失败时，在当前页显示「暂时读不到内容」，不用空列表代替。单篇文章缺少对应 `id` 时，仍显示「这篇文章不在了」。

`guestbook.js` 改为请求 `/api/guestbook`。读失败仍显示「暂时读不到留言」。

`version.json` 的版本探针保留，只用于代码更新后的自动刷新。

从这些页面移除 `admin.js`：`index.html`、`writing.html`、`notes.html`、`timeline.html`、`about.html`、`post.html`、`guestbook.html`。

首屏水墨、短句、导航、转场、光标和滚动进入保持不动。

## 导入

一次性导入，来源是当时的 `content/site.json`：

- 关于的三段文字
- 两篇手记，标识和日期不变
- 三条时间线，标识、时间和文案不变
- `assets/img/uploads/mw91l0nvgvs8.png` 放入 R2，键为 `mw91l0nvgvs8.png`
- 该手记正文里的图片地址改为 `/media/mw91l0nvgvs8.png`

导入前若线上 `/.netlify/functions/guestbook` 仍返回 `items`，把这些留言原样写入 `guestbook`。请求失败或没有条目时，留言从空表开始。

## 上线

1. 用 Wrangler 部署 Worker，静态资源目录为站点根目录，排除 `.git`、`node_modules` 和 `netlify`。
2. 在 `*.workers.dev` 上核对首页、文章、手记、关于、时间线、留言、插图和后台登录与写入。
3. 把 `kriswang.me` 添加到当前 Cloudflare 账号。切换域名服务器之前，先抄下阿里云上现有的全部 DNS 记录。
4. 域名服务器改到 Cloudflare 之后，把站点和 `www` 绑到 Worker `kris`。与站点无关的记录按抄下来的内容建回去。
5. `https://kriswang.me` 与后台都确认可用后，日常发布只走 Wrangler。阿里云 `deploy.sh` 和 Netlify 留言停止使用。这两个旧入口在这次实现里先留在仓库里，不作为发布路径。

## 验收

- 未登录打开公开页，能看到导入后的关于、两篇手记和三条时间线。
- 未登录不能调用任何写接口。
- 错误密码与不存在的用户名得到同一句提示。
- 登录后可以新增、修改、删除文章和手记；关于可以保存；时间线和留言可以删除。
- 保存后刷新对应公开页，能看到新内容，时间线出现在最上方。
- 连续保存同一篇且生成的时间线文案相同，时间线仍只有一条，时间更新。
- 插图上传后，公开页能打开 `/media/<key>`。
- 留言的空字段、蜜罐、15 秒限制和 200 条上限按上面的规则工作。
- 公开页源码和脚本里没有后台密码。

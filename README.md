# Kris — 个人博客

纯静态的个人站点。纸白底、墨黑字，衬线正文配等宽元信息，只有发丝线，没有阴影和动画。

线上地址：**https://kriswang.me**

## 怎么看

直接用浏览器打开 `index.html` 就行，不需要构建、不需要装任何东西。

想在本地起个服务（手机同局域网预览时更方便）：

```bash
cd site
python3 -m http.server 8080
# 然后访问 http://localhost:8080
```

## 目录

```
site/
├── index.html        首页（首屏 + 文章 / 手记 / 照片三个区块）
├── writing.html      文章列表
├── notes.html        手记
├── moments.html      照片墙
├── about.html        关于 + 联系方式
├── post.html         单篇文章（?p=文章id）
├── CNAME             自定义域名（GitHub Pages 用）
├── content/
│   └── site.json     ★ 所有内容都在这里
└── assets/
    ├── css/style.css 所有样式，改颜色改字体都在开头 :root 里
    ├── js/site.js    按 content/site.json 渲染页面
    ├── js/main.js    交互：手机菜单、照片墙分栏、灯箱
    ├── js/admin.js   编辑模式（网页里直接写内容）
    └── img/
        └── avatar.svg  头像 / favicon
```

**内容和代码是分开的。** 所有文章、手记、照片、自我介绍都存在 `content/site.json` 里，
样式和页面结构改动不会碰这个文件，改代码也不会把你的内容弄丢。
每次保存都会在 Git 历史里留一版，写坏了可以从历史里翻回来。

## 在网页里写内容（不用命令行）

1. 先做一个 GitHub 令牌（只需要一次）：
   GitHub → 头像 → Settings → Developer settings → **Personal access tokens → Fine-grained tokens**
   → Generate new token → 仓库选 **Only select repositories → wyf-yfw/blog**
   → Permissions → Repository permissions → **Contents: Read and write**
   → 生成后复制，只显示一次
2. 打开 https://kriswang.me ，按 **Ctrl + Shift + E**（Mac 是 ⌘ + Shift + E）
3. 第一次会让你粘贴令牌，粘完回车。令牌只存在这台设备的浏览器里，不会进仓库
4. 底部出现黑色工具条：「文章 / 手记 / 照片 / 关于」，点进去写，点「保存并发布」
5. 约 1 分钟后线上生效；想退出就点「退出」，会清掉本机存的令牌

工具条上的「备份」会把当前 `content/site.json` 下载一份，留个底。

只有在浏览器里存过令牌的人能解锁编辑模式，没有令牌谁都写不进去——
网页里的按钮只是隐藏，真正的权限在 GitHub 那边。

## 联系方式

| 平台 | 账号 | 链接 |
|---|---|---|
| 邮箱 | krisyfwang@gmail.com | mailto |
| GitHub | @wyf-yfw | https://github.com/wyf-yfw |
| X | @wyfyfw1 | https://x.com/wyfyfw1 |
| Instagram | @wg_peach666 | https://www.instagram.com/wg_peach666/ |
| 抖音 | w806137714 | https://www.douyin.com/search/w806137714 |
| 哔哩哔哩 | 650800563 | https://space.bilibili.com/650800563 |
| 小红书 | 5332018867 | https://www.xiaohongshu.com/user/profile/5332018867 |

抖音没有「抖音号」直达主页的公开地址，链接用的是搜索页，进去第一个结果就是你。

改的时候搜 `krisyfwang`、`wyf-yfw`、`wyfyfw1`、`wg_peach666`、`w806137714`、`650800563`、`5332018867`
就能在每个页面的页脚、首页首屏和关于页找到全部位置。

## 直接改文件（备选）

不想用网页编辑器时，也可以手动改 `content/site.json`，格式：

```json
{
  "about": { "paragraphs": ["第一段", "第二段"] },
  "articles": [
    { "id": "唯一 id", "date": "2026-11-09", "title": "标题",
      "excerpt": "摘要", "tags": ["生活"], "minutes": 8,
      "body": "空一行分段。\n\n## 小标题\n\n> 引用\n\n- 列表项" }
  ],
  "notes": [
    { "id": "唯一 id", "date": "2026-11-09", "text": "内容", "tags": [] }
  ],
  "photos": [
    { "id": "唯一 id", "src": "assets/img/uploads/xxx.jpg",
      "caption": "说明", "date": "2026-11-09", "width": 1200, "height": 1500 }
  ]
}
```

`body` 支持：空一行分段、`## 小标题`、`> 引用`、`- 列表`、`**粗体**`、`` `代码` ``。

**改名字**：全局搜索 `Kris`，替换成你的名字。涉及标题、导航、页脚。

**换头像**：把 `assets/img/avatar.svg` 换成你的照片，或者直接改各页面 `<link rel="icon">` 指向新文件。

**改配色**：打开 `assets/css/style.css`，最上面的 `:root` 就是全部颜色变量。
`--paper` 是纸色，`--ink` 是标题色，`--body` 是正文色，`--muted` 是日期、说明这类次要信息。

**改字体**：同样在 `:root` 里的 `--font-serif / --font-sans / --font-mono`。
中文默认走系统字体（Mac 的苹方/宋体、Windows 的微软雅黑/思源），
英文走 Google Fonts 的 Source Serif 4 / Inter / IBM Plex Mono。断网时会自动回退，不会崩。

## 交互

- 窄屏时导航收进右上角按钮，点开是纵向菜单，`Esc` 关闭。
- 照片墙点开是大图，支持 `←` `→` 翻页、`Esc` 关闭，三栏按图片高度自动配平。
- 编辑模式：`Ctrl + Shift + E` 开关（详见上面「在网页里写内容」）。
- 系统开了「减少动态效果」时，过渡动画会关掉。

## 部署

线上地址：**https://kriswang.me**

- 仓库：https://github.com/wyf-yfw/blog （`main` 分支根目录）
- 托管：GitHub Pages，推上去自动构建，`.nojekyll` 跳过 Jekyll 处理
- 域名：`kriswang.me`，仓库根目录的 `CNAME` 文件指定；`www` 和裸域名都指向它
- HTTPS：Let's Encrypt 自动签发，强制跳转
- DNS（阿里云）：`@` 四条 A 记录指向 `185.199.108-111.153`，`www` CNAME 到 `wyf-yfw.github.io`

`main` 分支开了保护规则（Ruleset `protect-main`）：

- 禁止删除 `main`
- 禁止强推（force push），历史不能被改写
- 只有仓库管理员（你）能推，其他人没有写权限

改了代码直接 `git push` 就行，规则对你是放行的。

换成别的托管也行，纯静态扔哪儿都能跑：

- **Cloudflare Pages / Vercel**：新建项目，构建命令留空，输出目录填 `.`，再把域名 DNS 迁过去。
- **自己的服务器**：把 `site/` 里的内容拷到 nginx 的静态目录即可。

# Kris — 个人博客

纯静态的个人站点：写字、记手记、放照片、留联系方式。
纸白底、墨黑字，衬线正文配等宽元信息，只有发丝线，没有阴影和动画。

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
├── index.html        首页（首屏 + 最近文章 + 手记 + 照片带）
├── writing.html      文章（按年份归档，可筛选）
├── post.html         单篇文章示例（正文排版示范）
├── notes.html        手记（短条目，可筛选）
├── moments.html      照片（三列瀑布流 + 灯箱）
├── about.html        关于（自我介绍 + 时间线 + 此刻 + 联系方式）
├── feed.xml          RSS
└── assets/
    ├── css/style.css 所有样式，改颜色改字体都在开头 :root 里
    ├── js/main.js    交互：手机菜单、标签筛选、照片灯箱
    └── img/
        ├── avatar.svg        头像（占位，换成你的照片）
        └── photos/*.jpg      照片（示例图，全部替换成你自己的）
```

## 换成你自己的内容

**改名字**：全局搜索 `Kris`，替换成你的名字。涉及标题、导航、页脚、`about.html` 正文。

**换头像**：把 `assets/img/avatar.svg` 换成你的照片，或者直接改各页面 `<link rel="icon">` 指向新文件。

**换照片**：把 `assets/img/photos/` 里的图换成自己的，文件名保持一致就不用改 HTML；
想改文件名，记得同步改 `moments.html` 里 `figure` 的 `data-src` 和 `img src` 两处。

**改配色**：打开 `assets/css/style.css`，最上面的 `:root` 就是全部颜色变量。
`--paper` 是纸色，`--ink` 是标题色，`--body` 是正文色，`--muted` 是日期、说明这类次要信息。

**改字体**：同样在 `:root` 里的 `--font-serif / --font-sans / --font-mono`。
中文默认走系统字体（Mac 的苹方/宋体、Windows 的微软雅黑/思源），
英文走 Google Fonts 的 Source Serif 4 / Inter / IBM Plex Mono。断网时会自动回退，不会崩。

**加一篇文章**：复制 `post.html`，改标题、日期、正文即可。
`writing.html` 里照着现有 `<a class="row">` 复制一条，改日期和标题。
筛选用的是 `data-tag`，可选值：`life` `study` `photo` `tech`。

**加一条手记**：在 `notes.html` 的 `.notes` 里复制一个 `<article class="note">`，
`data-tag` 可选值：`read` `tech` `life` `think`。

**加一张照片**：在 `moments.html` 的 `.masonry` 里复制一个 `<figure>`，
`data-src` 和 `img src` 都指向同一张图，`data-cap` 和 `figcaption` 写同一句说明。

## 交互

- 窄屏时导航收进右上角按钮，点开是纵向菜单，`Esc` 关闭。
- 文字页和手记页的标签可以筛选，筛完没有条目的年份会自动收起。
- 照片墙点开是大图，支持 `←` `→` 翻页、`Esc` 关闭。
- 系统开了「减少动态效果」时，过渡动画会关掉。

## 部署

线上地址：**https://kriswang.me**

- 仓库：https://github.com/wyf-yfw/blog （`main` 分支根目录）
- 托管：GitHub Pages，推上去自动构建，`.nojekyll` 跳过 Jekyll 处理
- 域名：`kriswang.me`，仓库根目录的 `CNAME` 文件指定；`www` 和裸域名都指向它
- HTTPS：Let's Encrypt 自动签发，强制跳转
- DNS（阿里云）：`@` 四条 A 记录指向 `185.199.108-111.153`，`www` CNAME 到 `wyf-yfw.github.io`

改完直接 `git push`，一两分钟后站点更新，不用手动构建。

换成别的托管也行，纯静态扔哪儿都能跑：

- **Cloudflare Pages / Vercel**：新建项目，构建命令留空，输出目录填 `.`，再把域名 DNS 迁过去。
- **自己的服务器**：把 `site/` 里的内容拷到 nginx 的静态目录即可。

## 还没做的

- 文章列表目前是手写的，量大了建议换成 Astro / 11ty 之类从 Markdown 生成。
- 没有搜索、没有评论、没有访问统计——需要的话可以后加。

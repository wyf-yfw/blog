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
├── CNAME             自定义域名（GitHub Pages 用）
└── assets/
    ├── css/style.css 所有样式，改颜色改字体都在开头 :root 里
    ├── js/main.js    交互：手机菜单、标签筛选、照片灯箱
    └── img/
        └── avatar.svg  头像 / favicon
```

现在四个内容区都是空的，页面里留了 `<p class="empty">还没有文章。</p>` 这样的占位行，往里加内容时把那行删掉、换成真实条目即可。

## 联系方式

- 邮箱 krisyfwang@gmail.com
- GitHub [@wyf-yfw](https://github.com/wyf-yfw)
- X [@wyfyfw1](https://x.com/wyfyfw1)

改的时候搜 `krisyfwang`、`wyf-yfw`、`wyfyfw1` 就能找到全部位置。

## 换成你自己的内容

**改名字**：全局搜索 `Kris`，替换成你的名字。涉及标题、导航、页脚。

**换头像**：把 `assets/img/avatar.svg` 换成你的照片，或者直接改各页面 `<link rel="icon">` 指向新文件。

**改配色**：打开 `assets/css/style.css`，最上面的 `:root` 就是全部颜色变量。
`--paper` 是纸色，`--ink` 是标题色，`--body` 是正文色，`--muted` 是日期、说明这类次要信息。

**改字体**：同样在 `:root` 里的 `--font-serif / --font-sans / --font-mono`。
中文默认走系统字体（Mac 的苹方/宋体、Windows 的微软雅黑/思源），
英文走 Google Fonts 的 Source Serif 4 / Inter / IBM Plex Mono。断网时会自动回退，不会崩。

## 加内容

**加一篇文章**：在 `writing.html` 的 `.year` 区块里加一条

```html
<a class="row" href="post-xxx.html" data-tag="life">
  <span class="row__date">11·09</span>
  <span class="row__title">标题</span>
  <span class="row__tags">生活</span>
</a>
```

再新建一个 `post-xxx.html` 当正文页，结构参考下面的「文章页骨架」。
首页 `index.html` 的「最近写的」区块里也照 `.entry` 加一条。
`data-tag` 可选值：`life` `study` `photo` `tech`。

**加一条手记**：在 `notes.html` 的 `.notes` 里加

```html
<article class="note" data-tag="think">
  <div class="note__date">2026.11.09</div>
  <p class="note__text">正文。</p>
</article>
```

`data-tag` 可选值：`read` `tech` `life` `think`。

**加一张照片**：把图片放进 `assets/img/photos/`，在 `moments.html` 里加

```html
<figure data-src="assets/img/photos/xxx.jpg" data-cap="说明">
  <img src="assets/img/photos/xxx.jpg" alt="说明" width="1200" height="1500" loading="lazy">
  <figcaption>说明</figcaption>
</figure>
```

照片墙需要外层容器带 `data-masonry` 和 `data-lightbox-set`，灯箱才会生效；
没有 JS 时会退化成三栏 CSS columns。

### 文章页骨架

```html
<main id="main">
  <article>
    <div class="wrap">
      <header class="article__head">
        <div class="article__meta"><span>2026.11.09</span><span>8 分钟读完</span><span>生活</span></div>
        <h1 class="article__title">标题</h1>
        <p class="article__lede">副标题。</p>
      </header>
      <div class="prose">
        <p>正文段落。</p>
        <h2>小标题</h2>
        <blockquote><p>引用。</p></blockquote>
      </div>
      <footer class="article__foot">
        <div class="article__tags">生活</div>
        <a class="sec__more" href="writing.html">← 回到文章列表</a>
      </footer>
    </div>
  </article>
</main>
```

## 交互

- 窄屏时导航收进右上角按钮，点开是纵向菜单，`Esc` 关闭。
- 带 `data-filter` 的筛选栏可以按 `data-tag` 过滤，没有匹配的年份分组会自动收起（现在页面里没放筛选栏，需要时加上即可）。
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

import { expect, test } from "vitest";
import about from "../about.html?raw";
import guestbook from "../guestbook.html?raw";
import guestbookJs from "../assets/js/guestbook.js?raw";
import index from "../index.html?raw";
import notes from "../notes.html?raw";
import post from "../post.html?raw";
import siteJs from "../assets/js/site.js?raw";
import timeline from "../timeline.html?raw";
import linksPage from "../links.html?raw";
import linksJs from "../assets/js/links.js?raw";
import starsPage from "../stars.html?raw";
import writing from "../writing.html?raw";

const pages = [index, writing, notes, timeline, about, post, guestbook, starsPage, linksPage];

test("公开页不再引用页内编辑脚本", () => {
  for (const html of pages) expect(html).not.toContain("admin.js");
});

test("公开脚本改向新接口，并有失败提示", () => {
  expect(siteJs).toContain("/api/site");
  expect(siteJs).toContain("kris-site-v1");
  expect(siteJs).toContain("/api/view");
  expect(siteJs).toContain("次浏览");
  expect(siteJs).toContain("暂时读不到内容");
  expect(siteJs).not.toContain("content/site.json");
  expect(siteJs).toContain("/media/");
  expect(guestbookJs).toContain('const API = "/api/guestbook"');
});

import admin from "../admin.html?raw";
import adminJs from "../assets/js/admin-app.js?raw";
import starsJs from "../assets/js/stars.js?raw";
import headers from "../_headers?raw";

test("后台页不进公开导航，脚本走登录接口", () => {
  for (const html of pages) expect(html).not.toContain('href="admin.html"');
  expect(admin).toContain('src="assets/js/admin-app.js');
  expect(admin).toContain('data-tab="quota"');
  expect(adminJs).toContain("/api/admin/login");
  expect(adminJs).toContain("/api/admin/usage");
  expect(adminJs).toContain("/api/admin/media");
  expect(adminJs).toContain("1600");
  expect(adminJs).not.toContain("password_hash");
});

test("推荐页不把同步失败原因给访客看，缓存和其他页一致", () => {
  expect(starsJs).not.toContain("data.message");
  expect(headers).toContain("/stars\n");
  expect(headers).toContain("/links\n");
  expect(linksPage).toContain('href="links.html" aria-current="page"');
  expect(linksPage).toContain("申请友链");
  expect(linksPage).toContain("data-link-panel hidden");
  expect(linksPage.indexOf("朋友们的站点")).toBeLessThan(linksPage.indexOf("data-link-open"));
  expect(linksPage.indexOf("data-link-open")).toBeLessThan(linksPage.indexOf("data-links"));
  expect(linksJs).toContain("/api/links");
  expect(linksJs).toContain("method: \"POST\"");
  expect(adminJs).toContain("/approve");
  expect(adminJs).toContain("/reject");
  expect(adminJs).toContain("同意");
  expect(adminJs).toContain("不同意");
  expect(adminJs).toContain("/remove");
  expect(adminJs).toContain("data-count");
  expect(adminJs).toContain('count + " 字"');
  expect(adminJs).toContain("tag-pick");
  expect(adminJs).toContain("knownTags");
});

test("关掉写作页不会把草稿再存回去，长文保存不带 keepalive", () => {
  const closeFn = adminJs.slice(adminJs.indexOf("function closeSheet"), adminJs.indexOf("async function openSheet"));
  expect(closeFn).not.toContain("flush");
  expect(closeFn).toContain("removeEventListener");
  expect(adminJs).not.toContain("keepalive: true");
  expect(adminJs).toContain("saveDraft(false, true)");
});

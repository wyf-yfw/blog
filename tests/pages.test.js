import { expect, test } from "vitest";
import about from "../about.html?raw";
import guestbook from "../guestbook.html?raw";
import guestbookJs from "../assets/js/guestbook.js?raw";
import index from "../index.html?raw";
import notes from "../notes.html?raw";
import post from "../post.html?raw";
import siteJs from "../assets/js/site.js?raw";
import timeline from "../timeline.html?raw";
import writing from "../writing.html?raw";

const pages = [index, writing, notes, timeline, about, post, guestbook];

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

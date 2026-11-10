import { expect, test } from "vitest";
import { buildUserSql } from "../worker/account-sql.js";
import { transformSite } from "../worker/import-site.js";

test("账号 SQL 替换唯一用户并清掉会话", () => {
  const sql = buildUserSql("kris", "pbkdf2-sha256$100000$aa$bb", "2026-11-10T00:00:00.000Z");
  expect(sql).toContain("DELETE FROM sessions;");
  expect(sql).toContain("DELETE FROM users;");
  expect(sql).toContain("INSERT INTO users (id, username, password_hash, created_at) VALUES (1, 'kris', 'pbkdf2-sha256$100000$aa$bb', '2026-11-10T00:00:00.000Z');");
});

test("手记图片地址改到 /media 且标识保留", () => {
  const out = transformSite({
    about: { paragraphs: ["大家好！"] },
    notes: [{
      id: "mw91l5n58il4",
      date: "2026-11-09",
      text: "字\n\n![说明](/assets/img/uploads/mw91l0nvgvs8.png?v=fix1)\n\n尾",
      tags: ["女朋友"],
    }],
    timeline: [{ id: "mw90u5ureg7n", date: "2026-11-09 16:50", text: "记了一笔", kind: "note" }],
    articles: [],
  });
  expect(out.notes[0].id).toBe("mw91l5n58il4");
  expect(out.notes[0].text).toContain("](/media/mw91l0nvgvs8.png)");
  expect(out.notes[0].text).not.toContain("/assets/img/uploads/");
  expect(out.timeline[0].id).toBe("mw90u5ureg7n");
});

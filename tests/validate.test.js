import { expect, test } from "vitest";
import { timelineText } from "../worker/timeline-text.js";
import { aboutInput, articleInput, goalsInput, noteInput } from "../worker/validate.js";

const today = "2026-11-10";

test("文章缺标题、坏类别、超长摘要、坏日期会被拒绝", () => {
  expect(() => articleInput({ title: "  " }, today)).toThrowError(expect.objectContaining({ hint: "标题要填" }));
  expect(() => articleInput({ title: "题", category: "别的" }, today)).toThrowError(expect.objectContaining({ hint: "类别不对" }));
  expect(() => articleInput({ title: "题", excerpt: "x".repeat(201) }, today)).toThrowError(expect.objectContaining({ hint: "摘要太长了" }));
  expect(() => articleInput({ title: "题", date: "2026-13-40" }, today)).toThrowError(expect.objectContaining({ hint: "日期格式不对" }));
});

test("阅读时长按正文每 400 字一分钟，图片不算", () => {
  expect(articleInput({ title: "题", minutes: 9, body: "" }, today).minutes).toBe(null);
  expect(articleInput({ title: "题", body: "字".repeat(400) }, today).minutes).toBe(1);
  expect(articleInput({ title: "题", body: "字".repeat(401) + "\n\n![图](/media/a.png)" }, today).minutes).toBe(2);
  expect(articleInput({ title: "题", body: "字".repeat(400 * 99 + 1) }, today).minutes).toBe(99);
});

test("合法文章补上当天日期和默认类别", () => {
  expect(articleInput({ title: " 题 ", tags: [" a ", ""] }, today)).toEqual({
    date: today,
    title: "题",
    excerpt: "",
    category: "学记",
    tags: ["a"],
    minutes: null,
    body: "",
  });
});

test("手记要有正文，关于会丢掉空段", () => {
  expect(() => noteInput({ text: "  " }, today)).toThrowError(expect.objectContaining({ hint: "手记要有内容" }));
  expect(noteInput({ text: " 一句 " }, today)).toEqual({ date: today, text: "一句", tags: [] });
  expect(aboutInput({ paragraphs: [" 甲 ", "", "乙"] })).toEqual(["甲", "乙"]);
});

test("年度目标丢掉空行，并记住完成状态", () => {
  expect(goalsInput({
    year: 2026,
    items: [{ text: " 写完 ", done: true }, { text: "  " }, { text: "跑步", done: false }],
  })).toEqual({
    year: 2026,
    items: [{ text: "写完", done: true }, { text: "跑步", done: false }],
  });
  expect(() => goalsInput({ year: 1999, items: [] })).toThrowError(expect.objectContaining({ hint: "年份不对" }));
  expect(() => goalsInput({ year: 2026, items: "不是列表" })).toThrowError(expect.objectContaining({ hint: "目标格式不对" }));
});

test("时间线文案按动作生成", () => {
  const forty = "一二三四五六七八九十".repeat(4);
  expect(timelineText("create", "article", "标题")).toBe("发布了文章：标题");
  expect(timelineText("update", "article", "标题")).toBe("更新了文章：标题");
  expect(timelineText("delete", "article", forty + "多余")).toBe("删除了文章：" + forty);
  expect(timelineText("create", "note", forty + "多余")).toBe("记了一笔手记：" + forty);
  expect(timelineText("update", "note", "短")).toBe("更新了手记：短");
  expect(timelineText("delete", "note", "短")).toBe("删除了手记：短");
  expect(timelineText("update", "about", "")).toBe("更新了关于");
});

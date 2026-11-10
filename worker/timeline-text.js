function cut(value) {
  return String(value || "").slice(0, 40);
}

export function timelineText(action, kind, value) {
  if (kind === "about") return "更新了关于";
  if (kind === "article" && action === "create") return "发布了文章：" + value;
  if (kind === "article" && action === "update") return "更新了文章：" + value;
  if (kind === "article" && action === "delete") return "删除了文章：" + cut(value);
  if (kind === "note" && action === "create") return "记了一笔手记：" + cut(value);
  if (kind === "note" && action === "update") return "更新了手记：" + cut(value);
  if (kind === "note" && action === "delete") return "删除了手记：" + cut(value);
  throw new Error("bad timeline");
}

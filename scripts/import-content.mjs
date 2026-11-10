import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { importSql, sqlString } from "../worker/import-site.js";

function run(args) {
  const child = spawn("npx", args, { stdio: "inherit" });
  return new Promise((resolve, reject) => {
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(args.join(" ") + " 退出 " + code))));
  });
}

const site = JSON.parse(await readFile(new URL("../content/site.json", import.meta.url), "utf8"));
// 旧留言只在能读到的时候才覆盖；读不到就完全不动 guestbook，避免把已有留言清空
let guestbook = null;
try {
  const res = await fetch(process.env.LEGACY_GUESTBOOK_URL || "");
  if (res.ok) {
    const data = await res.json();
    if (Array.isArray(data.items)) guestbook = data.items;
  }
} catch (e) {
  guestbook = null;
}
const lines = [importSql(site)];
if (guestbook) lines.push("DELETE FROM guestbook;");
for (const item of guestbook || []) {
  if (!item || !item.id || !item.name || !item.message) continue;
  lines.push(
    `INSERT INTO guestbook (id, name, message, created) VALUES (${sqlString(item.id)}, ${sqlString(item.name)}, ${sqlString(item.message)}, ${sqlString(item.created || new Date().toISOString())});`
  );
}
const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const dir = await mkdtemp(join(tmpdir(), "kris-import-"));
const file = join(dir, "import.sql");
await writeFile(file, lines.join("\n"), { mode: 0o600 });
await run(["wrangler", "r2", "object", "put", "kris-media/mw91l0nvgvs8.png", "--file", "assets/img/uploads/mw91l0nvgvs8.png", "--content-type", "image/png", "--remote"]);
await run(["wrangler", "d1", "execute", "kris", "--remote", "--file", file]);
await rm(dir, { recursive: true, force: true });
console.log("导入完成，留言 " + (guestbook ? guestbook.length : "未导入（旧地址没配置或读不到）") + " 条");

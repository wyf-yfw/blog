/* 部署前把 html 里的 ?v=xxx 换成这次提交的 SHA，避免浏览器拿到旧缓存 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const stamp = (process.argv[2] || Date.now().toString(36)).slice(0, 10);
const dir = new URL("..", import.meta.url).pathname;

const files = (await readdir(dir)).filter((name) => name.endsWith(".html"));
let touched = 0;

for (const name of files) {
  const path = join(dir, name);
  const before = await readFile(path, "utf8");
  const after = before.replace(/(\?v=)[0-9a-zA-Z]+/g, "$1" + stamp);
  if (after !== before) {
    await writeFile(path, after);
    touched += 1;
  }
}

console.log("版本号已戳成 " + stamp + "，改了 " + touched + " 个页面");

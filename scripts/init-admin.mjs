import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { buildUserSql } from "../worker/account-sql.js";
import { hashPassword } from "../worker/password.js";

const rl = createInterface({ input: stdin, output: stdout });
const username = (await rl.question("用户名：")).trim();
const password = await rl.question("密码：");
rl.close();
if (!username || !password) {
  console.error("用户名和密码都要填");
  process.exit(1);
}
const sql = buildUserSql(username, await hashPassword(password), new Date().toISOString());
const dir = await mkdtemp(join(tmpdir(), "kris-admin-"));
const file = join(dir, "user.sql");
await writeFile(file, sql, { mode: 0o600 });
const child = spawn("npx", ["wrangler", "d1", "execute", "kris", "--remote", "--file", file], { stdio: "inherit" });
const code = await new Promise((resolve) => child.on("close", resolve));
await rm(dir, { recursive: true, force: true });
process.exit(code ?? 1);

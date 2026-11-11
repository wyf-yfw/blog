import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, test } from "vitest";
import { handleStars, syncStars } from "../worker/stars.js";
import { resetDb } from "./helpers.js";

function repo(full, extra = {}) {
  const [owner, name] = full.split("/");
  return {
    full_name: full,
    name,
    owner: { login: owner },
    description: "描述",
    language: "Rust",
    stargazers_count: 7,
    html_url: "https://github.com/" + full,
    ...extra,
  };
}

function ok(list) {
  return async () => new Response(JSON.stringify(list), { status: 200 });
}

beforeEach(() => resetDb());

describe("star 同步", () => {
  test("正常同步写入并能读回来", async () => {
    const out = await syncStars(env, ok([
      { starred_at: "2026-11-01T10:00:00Z", repo: repo("a/b") },
      { starred_at: "2026-11-02T10:00:00Z", repo: repo("c/d", { language: "Go", stargazers_count: 99 }) },
    ]));
    expect(out.count).toBe(2);

    const body = await (await handleStars(env)).json();
    expect(body.ok).toBe(true);
    expect(body.items).toHaveLength(2);
    // 按 star 时间倒序，后 star 的在前
    expect(body.items[0]).toMatchObject({ repo: "c/d", language: "Go", stars: 99 });
    expect(body.items[1]).toMatchObject({ repo: "a/b", language: "Rust" });
  });

  test("GitHub 报错时保留旧数据", async () => {
    await syncStars(env, ok([{ starred_at: "2026-11-01T10:00:00Z", repo: repo("a/b") }]));

    await expect(syncStars(env, async () => new Response("{}", { status: 403 }))).rejects.toThrow();

    const body = await (await handleStars(env)).json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].repo).toBe("a/b");
    expect(body.ok).toBe(false);
    expect(body.message).toContain("403");
  });

  test("取消 star 的仓库下次同步会消失", async () => {
    await syncStars(env, ok([
      { starred_at: "2026-11-01T10:00:00Z", repo: repo("a/b") },
      { starred_at: "2026-11-02T10:00:00Z", repo: repo("c/d") },
    ]));
    await syncStars(env, ok([{ starred_at: "2026-11-02T10:00:00Z", repo: repo("c/d") }]));

    const body = await (await handleStars(env)).json();
    expect(body.items.map((i) => i.repo)).toEqual(["c/d"]);
  });

  test("描述和语言为空时不出现 null", async () => {
    await syncStars(env, ok([
      { starred_at: "2026-11-01T10:00:00Z", repo: repo("a/b", { description: null, language: null }) },
    ]));
    const body = await (await handleStars(env)).json();
    expect(body.items[0].description).toBe("");
    expect(body.items[0].language).toBe("");
  });

  test("超过一页时把后面的页也收进来", async () => {
    const page = (name) => [{ starred_at: "2026-11-01T10:00:00Z", repo: repo("o/" + name) }];
    const first = Array.from({ length: 100 }, (_, i) => ({
      starred_at: "2026-11-02T10:00:00Z",
      repo: repo("o/p" + i),
    }));
    await syncStars(env, async (url) => {
      const pageNo = new URL(url).searchParams.get("page");
      const list = pageNo === "2" ? page("last") : first;
      return new Response(JSON.stringify(list), { status: 200 });
    });
    const body = await (await handleStars(env)).json();
    expect(body.items).toHaveLength(101);
    expect(body.items.some((item) => item.repo === "o/last")).toBe(true);
  });

  test("后面的页失败时保留旧数据", async () => {
    await syncStars(env, ok([{ starred_at: "2026-11-01T10:00:00Z", repo: repo("a/b") }]));
    const first = Array.from({ length: 100 }, (_, i) => ({
      starred_at: "2026-11-03T10:00:00Z",
      repo: repo("n/" + i),
    }));
    await expect(syncStars(env, async (url) => {
      const pageNo = new URL(url).searchParams.get("page");
      if (pageNo === "2") return new Response("{}", { status: 502 });
      return new Response(JSON.stringify(first), { status: 200 });
    })).rejects.toThrow();
    const body = await (await handleStars(env)).json();
    expect(body.items.map((item) => item.repo)).toEqual(["a/b"]);
    expect(body.ok).toBe(false);
  });

  test("GitHub 返回的不是列表时不把已有数据清掉", async () => {
    await syncStars(env, ok([{ starred_at: "2026-11-01T10:00:00Z", repo: repo("a/b") }]));
    await expect(syncStars(env, async () => new Response(JSON.stringify({ message: "nope" }), { status: 200 }))).rejects.toThrow();
    const body = await (await handleStars(env)).json();
    expect(body.items.map((item) => item.repo)).toEqual(["a/b"]);
  });

  test("没有 starred_at 时用同步时间兜底，不抛错", async () => {
    await syncStars(env, ok([repo("x/y")]));   // 裸 repo 数组，兼容模式
    const body = await (await handleStars(env)).json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].repo).toBe("x/y");
    expect(typeof body.items[0].starredAt).toBe("string");
    expect(body.items[0].starredAt.length).toBeGreaterThan(10);
  });
});

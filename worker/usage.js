import { json } from "./http.js";

// 免费方案数字取自 Cloudflare 文档，核对日期：
// Workers Limits 2026-10-29，D1 Pricing 2026-10-30，R2 Pricing 2026-10-30。
const REQUESTS_PER_DAY = 100_000;
const CPU_MS = 10;
const SUBREQUESTS = 50;
const SCRIPTS = 100;
const ASSET_FILES = 20_000;
const ROWS_READ = 5_000_000;
const ROWS_WRITTEN = 100_000;
const DATABASE_BYTES = 500_000_000;
const ACCOUNT_BYTES = 5_000_000_000;
const DATABASES = 10;
const R2_BYTES = 10_000_000_000;
const CLASS_A = 1_000_000;
const CLASS_B = 10_000_000;
const DOMAINS = 100;

const ACCOUNT = {
  id: "6f6313228c73cdb5db875d457647bb2e",
  script: "kris",
  databaseId: "1d2356f7-a066-4824-8024-ed5c1b96f6ae",
  bucket: "kris-media",
};

const CLASS_A_ACTIONS = new Set([
  "ListBuckets", "PutBucket", "ListObjects", "PutObject", "CopyObject",
  "CompleteMultipartUpload", "CreateMultipartUpload", "LifecycleStorageTierTransition",
  "ListMultipartUploads", "UploadPart", "UploadPartCopy", "ListParts",
  "PutBucketEncryption", "PutBucketCors", "PutBucketLifecycleConfiguration",
]);
const CLASS_B_ACTIONS = new Set([
  "HeadBucket", "HeadObject", "GetObject", "UsageSummary",
  "GetBucketEncryption", "GetBucketLocation", "GetBucketCors", "GetBucketLifecycleConfiguration",
]);
const FREE_ACTIONS = new Set(["DeleteObject", "DeleteBucket", "AbortMultipartUpload"]);

const CLIENT_ID = "54d11594-84e4-41aa-b438-e81b8fa78ee7";
let tokenCache = null;

const num = (n) => new Intl.NumberFormat("zh-CN").format(n);

export function classifyR2(action) {
  if (CLASS_A_ACTIONS.has(action)) return "a";
  if (CLASS_B_ACTIONS.has(action)) return "b";
  if (FREE_ACTIONS.has(action)) return "free";
  return "other";
}

export function nextDailyReset(now) {
  const t = new Date(now);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1)).toISOString();
}

export function nextMonthlyReset(now) {
  const t = new Date(now);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1)).toISOString();
}

function known(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sum(rows, key) {
  if (!rows) return null;
  let total = 0;
  for (const row of rows) {
    const n = known(row[key]);
    if (n == null) return null;
    total += n;
  }
  return total;
}

function remain(used, limit) {
  if (used == null || limit == null) return null;
  return Math.max(0, limit - used);
}

function meter(id, name, used, limit, unit, resetsAt, detail) {
  return { id, name, kind: "meter", used, limit, remaining: remain(used, limit), unit, resetsAt, detail };
}

function cap(id, name, limit, unit, detail) {
  return { id, name, kind: "cap", used: null, limit, remaining: null, unit, resetsAt: null, detail };
}

function included(id, name, detail) {
  return { id, name, kind: "included", used: null, limit: null, remaining: null, unit: null, resetsAt: null, detail };
}

function bytesText(n) {
  if (n == null || !Number.isFinite(Number(n))) return "还没有测到";
  const v = Number(n);
  if (v < 1000) return num(v) + " B";
  if (v < 1e6) return (v / 1e3).toFixed(1) + " KB";
  if (v < 1e9) return (v / 1e6).toFixed(1) + " MB";
  return (v / 1e9).toFixed(2) + " GB";
}

function msText(microseconds) {
  return String(Math.round(microseconds / 100) / 10);
}

function joinCount(rows, label) {
  return rows.map((row) => row.name + " " + num(row[label] || 0) + " 行").join("，");
}

export function buildReport(input = {}, now = new Date()) {
  const daily = nextDailyReset(now);
  const monthly = nextMonthlyReset(now);
  const workers = input.workers || null;
  const scripts = input.scripts || null;
  const databases = input.databases || null;
  const r2 = input.r2 || null;
  const domains = input.domains || null;
  const mine = databases && databases.find((row) => row.id === ACCOUNT.databaseId);

  const requestDetail = workers
    ? (workers.length
      ? workers.map((row) => row.script + " " + num(row.requests || 0) + " 次").join("，") + "。同一账号里的脚本共用这一份额度。"
      : "今天还没有请求。同一账号里的脚本共用这一份额度。")
    : "同一账号里的脚本共用每天 100,000 次。";
  const errors = workers ? workers.reduce((total, row) => total + (row.errors || 0), 0) : 0;
  const cpuRow = workers && (workers.find((row) => row.script === ACCOUNT.script) || workers[0]);
  const cpuDetail = cpuRow && cpuRow.cpuP99 != null
    ? cpuRow.script + " 今天 99 分位 " + msText(cpuRow.cpuP99) + " 毫秒，中位 " + msText(cpuRow.cpuP50 || 0) + " 毫秒。每次请求的上限是 10 毫秒。"
    : "每次请求的 CPU 上限是 10 毫秒。";
  const subDetail = workers
    ? "今天一共 " + num(sum(workers, "subrequests") || 0) + " 次子请求。每次请求最多 50 次。"
    : "每次请求最多 50 次子请求。";
  const scriptNames = scripts ? scripts.map((row) => row.id).filter(Boolean) : [];
  const readDetail = databases && databases.every((row) => row.rowsRead != null)
    ? joinCount(databases, "rowsRead") + "。"
    : "同一账号里的数据库共用每天 5,000,000 行。";
  const writeDetail = databases && databases.every((row) => row.rowsWritten != null)
    ? joinCount(databases, "rowsWritten") + "。"
    : "同一账号里的数据库共用每天 100,000 行。";
  const sizeDetail = databases
    ? databases.map((row) => row.name + " " + bytesText(row.bytes)).join("，") + "。删掉数据之后体积才会下降。"
    : "删掉数据之后体积才会下降。";
  const classDetail = r2
    ? "按 UTC 自然月统计这个账号的桶。"
      + (r2.free ? " 删除类操作 " + num(r2.free) + " 次，不计入。" : "")
      + (r2.other ? " 另有 " + num(r2.other) + " 次还没有归类。" : "")
    : "按 UTC 自然月统计。删除对象不计入。";

  return [
    {
      id: "workers",
      title: "Workers",
      note: "请求在北京时间每天早上 8 点清零。CPU、子请求和文件数是单次或单个版本的上限。",
      items: [
        meter("workers-requests", "今日请求", sum(workers, "requests"), REQUESTS_PER_DAY, "次", daily,
          requestDetail + (errors ? " 失败 " + num(errors) + " 次。" : "")),
        meter("workers-scripts", "脚本个数", scripts ? scripts.length : null, SCRIPTS, "个", null,
          scriptNames.length ? scriptNames.join("、") + "。" : "这个账号最多 100 个脚本。"),
        cap("workers-cpu", "单次 CPU", CPU_MS, "毫秒", cpuDetail),
        cap("workers-subrequests", "单次子请求", SUBREQUESTS, "次", subDetail),
        cap("workers-assets", "静态文件", ASSET_FILES, "个", "每个版本最多 20,000 个文件，单个文件最多 25 MiB。用量接口不提供当前文件个数。"),
      ],
    },
    {
      id: "d1",
      title: "D1",
      note: "读取和写入在北京时间每天早上 8 点清零。体积和库的个数不会自动清零。",
      items: [
        meter("d1-reads", "今日读取", sum(databases, "rowsRead"), ROWS_READ, "行", daily, readDetail),
        meter("d1-writes", "今日写入", sum(databases, "rowsWritten"), ROWS_WRITTEN, "行", daily, writeDetail),
        meter("d1-database", "这个库的体积", mine ? known(mine.bytes) : (databases ? null : null), DATABASE_BYTES, "B", null,
          (mine ? mine.name + " 现在 " + bytesText(mine.bytes) + "。" : "") + "单个库上限 500 MB。"),
        meter("d1-storage", "账号存储", sum(databases, "bytes"), ACCOUNT_BYTES, "B", null, sizeDetail),
        meter("d1-count", "数据库个数", databases ? databases.length : null, DATABASES, "个", null,
          databases ? databases.map((row) => row.name).join("、") + "。" : "这个账号最多 10 个数据库。"),
      ],
    },
    {
      id: "r2",
      title: "R2",
      note: "操作次数按 UTC 自然月估算，下次从下月 1 日北京时间早上 8 点起算。存储按这个月每天峰值的平均计费。",
      items: [
        meter("r2-storage", "当前占用", r2 ? known(r2.bytes) : null, R2_BYTES, "B", null,
          r2 && r2.bytes != null
            ? "最近一次采样 " + bytesText(r2.bytes) + (r2.objects != null ? "，" + num(r2.objects) + " 个对象" : "") + "。账单用的是月平均，这里是采样值。"
            : "免费含 10 GB·月。账单用每天峰值的平均，这里在有采样时显示最近一次占用。"),
        meter("r2-class-a", "本月 A 类操作", r2 ? known(r2.classA) : null, CLASS_A, "次", monthly, classDetail),
        meter("r2-class-b", "本月 B 类操作", r2 ? known(r2.classB) : null, CLASS_B, "次", monthly, classDetail),
        included("r2-egress", "出站流量", "免费方案的出站流量不另计费用。"),
      ],
    },
    {
      id: "zone",
      title: "域名",
      note: "kriswang.me 已经接到这个 Worker。",
      items: [
        meter("zone-domains", "自定义域名", domains ? domains.length : null, DOMAINS, "个", null,
          (domains && domains.length ? domains.map((row) => row.hostname).filter(Boolean).join("、") + "。" : "") + "每个站点最多 100 个自定义域名。"),
        included("zone-dns", "DNS 和证书", "kriswang.me 的 DNS 和证书含在免费方案里。"),
      ],
    },
  ];
}

async function bearer(env) {
  if (env.CF_API_TOKEN) return env.CF_API_TOKEN;
  const refresh = tokenCache?.refresh || env.CF_REFRESH_TOKEN;
  if (!refresh) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.access;
  const res = await fetch("https://dash.cloudflare.com/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: CLIENT_ID,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) return null;
  tokenCache = {
    access: data.access_token,
    refresh: data.refresh_token || refresh,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return tokenCache.access;
}

async function cf(access, url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("authorization", "Bearer " + access);
  headers.set("accept", "application/json");
  const res = await fetch(url, { method: options.method || "GET", headers, body: options.body });
  const data = await res.json().catch(() => null);
  if (res.status === 401) tokenCache = null;
  const errors = data?.errors;
  const hasErrors = Array.isArray(errors) ? errors.length > 0 : Boolean(errors);
  return { ok: res.ok && Boolean(data) && data.success !== false && !hasErrors, status: res.status, data };
}

function rowsOf(payload) {
  const result = payload?.data?.result;
  return Array.isArray(result) ? result : [];
}

function briefFailure(res) {
  const msg = res?.data?.errors?.[0]?.message;
  const safe = typeof msg === "string" && msg.length < 80 && !/token|bearer|authorization|oauth/i.test(msg) ? msg : "";
  return res ? String(res.status || "") + (safe ? " " + safe : "") : "";
}

function latestBy(rows, idKey) {
  const best = new Map();
  for (const row of rows || []) {
    const id = row?.dimensions?.[idKey];
    if (!id) continue;
    const when = row?.dimensions?.datetime || "";
    const prev = best.get(id);
    if (!prev || when > (prev.dimensions?.datetime || "")) best.set(id, row);
  }
  return best;
}

function databaseName(id, fallback) {
  if (fallback) return fallback;
  return id === ACCOUNT.databaseId ? "kris" : id;
}

function latestStorage(rows) {
  const best = new Map();
  for (const row of rows) {
    const name = row?.dimensions?.bucketName || "";
    const when = row?.dimensions?.datetime || "";
    const prev = best.get(name);
    if (!prev || when > (prev.dimensions?.datetime || "")) best.set(name, row);
  }
  let bytes = 0;
  let objects = 0;
  for (const row of best.values()) {
    bytes += Number(row.max?.payloadSize || 0) + Number(row.max?.metadataSize || 0);
    objects += Number(row.max?.objectCount || 0);
  }
  return best.size ? { bytes, objects } : { bytes: null, objects: null };
}

const USAGE_QUERY = `query Usage($account: String!, $day: Date!, $start: Time!, $now: Time!, $month: Time!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      workersInvocationsAdaptive(limit: 100, filter: { datetime_geq: $start, datetime_leq: $now }) {
        sum { requests errors subrequests }
        quantiles { cpuTimeP50 cpuTimeP99 }
        dimensions { scriptName }
      }
      d1AnalyticsAdaptiveGroups(limit: 100, filter: { date_geq: $day, date_leq: $day }) {
        sum { rowsRead rowsWritten }
        dimensions { databaseId }
      }
      d1StorageAdaptiveGroups(limit: 20, filter: { datetime_geq: $start, datetime_leq: $now }, orderBy: [datetime_DESC]) {
        max { databaseSizeBytes }
        dimensions { databaseId datetime }
      }
      r2OperationsAdaptiveGroups(limit: 200, filter: { datetime_geq: $month, datetime_leq: $now }) {
        sum { requests }
        dimensions { actionType bucketName }
      }
      r2StorageAdaptiveGroups(limit: 50, filter: { datetime_geq: $month, datetime_leq: $now }, orderBy: [datetime_DESC]) {
        max { payloadSize metadataSize objectCount }
        dimensions { datetime bucketName }
      }
    }
  }
}`;

export async function readUsage(env, now = new Date()) {
  const access = await bearer(env);
  if (!access) {
    return { notice: "还没有配上用量读取。下面是免费方案的上限和清零时间。", report: {} };
  }
  const day = now.toISOString().slice(0, 10);
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const account = ACCOUNT.id;
  let gql;
  let databasesRes;
  let scriptsRes;
  let domainsRes;
  try {
    [gql, databasesRes, scriptsRes, domainsRes] = await Promise.all([
      cf(access, "https://api.cloudflare.com/client/v4/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: USAGE_QUERY,
          variables: { account, day, start: day + "T00:00:00Z", now: now.toISOString(), month },
        }),
      }),
      cf(access, `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`),
      cf(access, `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts?per_page=100`),
      cf(access, `https://api.cloudflare.com/client/v4/accounts/${account}/workers/domains`),
    ]);
  } catch {
    return { notice: "用量暂时没有读到。下面仍是免费方案的上限和清零时间。", report: {} };
  }

  const report = {};
  const notices = [];
  if (scriptsRes.ok) {
    report.scripts = rowsOf(scriptsRes).map((row) => ({ id: row.id || row.name || "" }));
  } else notices.push("脚本个数");
  if (domainsRes.ok) {
    report.domains = rowsOf(domainsRes)
      .filter((row) => !row.service || row.service === ACCOUNT.script)
      .map((row) => ({ hostname: row.hostname || "" }));
  } else notices.push("自定义域名");

  const listed = databasesRes.ok ? rowsOf(databasesRes) : null;
  if (!databasesRes.ok) notices.push("数据库名单（" + briefFailure(databasesRes) + "）");
  const accountData = gql.ok ? gql.data?.data?.viewer?.accounts?.[0] : null;
  if (!accountData) notices.push("请求和操作次数");

  if (listed || accountData) {
    const byId = new Map();
    for (const row of listed || []) {
      byId.set(row.uuid || row.id, {
        id: row.uuid || row.id,
        name: row.name || row.uuid,
        bytes: known(row.file_size),
        rowsRead: accountData ? 0 : null,
        rowsWritten: accountData ? 0 : null,
      });
    }
    for (const row of accountData?.d1AnalyticsAdaptiveGroups || []) {
      const id = row.dimensions?.databaseId;
      if (!id) continue;
      const current = byId.get(id) || {
        id,
        name: databaseName(id),
        bytes: null,
        rowsRead: accountData ? 0 : null,
        rowsWritten: accountData ? 0 : null,
      };
      current.rowsRead = known(row.sum?.rowsRead);
      current.rowsWritten = known(row.sum?.rowsWritten);
      byId.set(id, current);
    }
    for (const [id, row] of latestBy(accountData?.d1StorageAdaptiveGroups, "databaseId")) {
      const current = byId.get(id) || {
        id,
        name: databaseName(id),
        bytes: null,
        rowsRead: accountData ? 0 : null,
        rowsWritten: accountData ? 0 : null,
      };
      const size = known(row.max?.databaseSizeBytes);
      if (current.bytes == null && size != null) current.bytes = size;
      current.name = databaseName(id, current.name === id ? "" : current.name);
      byId.set(id, current);
    }
    if (byId.size) report.databases = [...byId.values()];
  }

  if (accountData) {
    report.workers = (accountData.workersInvocationsAdaptive || []).map((row) => ({
      script: row.dimensions?.scriptName || "未命名",
      requests: known(row.sum?.requests) || 0,
      errors: known(row.sum?.errors) || 0,
      subrequests: known(row.sum?.subrequests) || 0,
      cpuP50: known(row.quantiles?.cpuTimeP50),
      cpuP99: known(row.quantiles?.cpuTimeP99),
    }));
    const tally = { a: 0, b: 0, free: 0, other: 0 };
    for (const row of accountData.r2OperationsAdaptiveGroups || []) {
      const kind = classifyR2(row.dimensions?.actionType);
      tally[kind] += known(row.sum?.requests) || 0;
    }
    const storage = latestStorage(accountData.r2StorageAdaptiveGroups || []);
    report.r2 = {
      bytes: storage.bytes,
      objects: storage.objects,
      classA: tally.a,
      classB: tally.b,
      free: tally.free,
      other: tally.other,
    };
  }

  const notice = notices.length
    ? notices.join("、") + "暂时没有读到。其余数字是刚才查到的。"
    : null;
  return { notice, report };
}

export async function handleUsage(env, now = new Date()) {
  let notice = "用量暂时没有读到。下面仍是免费方案的上限和清零时间。";
  let report = {};
  try {
    const read = await readUsage(env, now);
    notice = read.notice;
    report = read.report;
  } catch {
    notice = "用量暂时没有读到。下面仍是免费方案的上限和清零时间。";
  }
  return json({
    ok: true,
    checkedAt: now.toISOString(),
    notice,
    groups: buildReport(report, now),
  });
}

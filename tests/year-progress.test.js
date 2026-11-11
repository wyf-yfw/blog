import { expect, test } from "vitest";
import { yearLine } from "../assets/js/year.js";

const HOUR = 60 * 60 * 1000;

test("北京时间元旦零点是 0.000000%", () => {
  const start = Date.UTC(2026, 0, 1) - 8 * HOUR;
  expect(yearLine(new Date(start))).toBe("2026 年已过 0.000000%");
});

test("过了一半是 50.000000%，含时分秒而不只算天数", () => {
  const start = Date.UTC(2026, 0, 1) - 8 * HOUR;
  const end = Date.UTC(2027, 0, 1) - 8 * HOUR;
  expect(yearLine(new Date(start + (end - start) / 2))).toBe("2026 年已过 50.000000%");
  // 2026-01-01 12:00 北京时间，平年里是半天
  expect(yearLine(new Date(Date.UTC(2026, 0, 1, 4, 0, 0)))).toBe("2026 年已过 0.136986%");
});

test("跨年以北京时间为准，闰年按 366 天", () => {
  const almost = new Date(Date.UTC(2026, 11, 31, 15, 0, 0));
  expect(yearLine(almost).startsWith("2026 年已过 99.")).toBe(true);
  const next = new Date(Date.UTC(2027, 0, 1) - 8 * HOUR);
  expect(yearLine(next)).toBe("2027 年已过 0.000000%");

  const leapStart = Date.UTC(2028, 0, 1) - 8 * HOUR;
  const leapEnd = Date.UTC(2029, 0, 1) - 8 * HOUR;
  expect(leapEnd - leapStart).toBe(366 * 24 * HOUR);
  expect(yearLine(new Date(leapStart + (leapEnd - leapStart) / 2))).toBe("2028 年已过 50.000000%");
});

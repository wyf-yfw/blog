/* 今年已过的比例：按北京时间的真实毫秒，从元旦零点算到下一年元旦 */
const OFFSET = 8 * 60 * 60 * 1000;

export function yearLine(now = new Date()) {
  const t = now.getTime();
  const year = new Date(t + OFFSET).getUTCFullYear();
  const start = Date.UTC(year, 0, 1) - OFFSET;
  const end = Date.UTC(year + 1, 0, 1) - OFFSET;
  const ratio = Math.min(1, Math.max(0, (t - start) / (end - start)));
  return year + " 年已过 " + (ratio * 100).toFixed(6) + "%";
}

function mountYear() {
  const el = document.querySelector("[data-year]");
  if (!el) return;
  const paint = () => { el.textContent = yearLine(); };
  paint();
  setInterval(paint, 100);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) paint();
  });
}

if (typeof document !== "undefined") mountYear();

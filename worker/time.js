export function shanghaiNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const bag = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const dateText = `${bag.year}-${bag.month}-${bag.day}`;
  return { date: dateText, stamp: `${dateText} ${bag.hour}:${bag.minute}` };
}

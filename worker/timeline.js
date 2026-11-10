import { newId } from "./ids.js";
import { shanghaiNow } from "./time.js";
import { timelineText } from "./timeline-text.js";

export async function recordTimeline(db, kind, action, value, now = new Date()) {
  const text = timelineText(action, kind, value);
  const stamp = shanghaiNow(now).stamp;
  const head = await db.prepare(
    "SELECT id, kind, text FROM timeline ORDER BY date DESC, rowid DESC LIMIT 1"
  ).first();
  if (head && head.kind === kind && head.text === text) {
    await db.prepare("UPDATE timeline SET date = ? WHERE id = ?").bind(stamp, head.id).run();
  } else {
    await db.prepare(
      "INSERT INTO timeline (id, date, text, kind) VALUES (?, ?, ?, ?)"
    ).bind(newId(), stamp, text, kind).run();
  }
  const extra = await db.prepare(
    "SELECT id FROM timeline ORDER BY date DESC, rowid DESC LIMIT -1 OFFSET 200"
  ).all();
  for (const row of extra.results) {
    await db.prepare("DELETE FROM timeline WHERE id = ?").bind(row.id).run();
  }
}

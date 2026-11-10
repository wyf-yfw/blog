export function transformSite(site) {
  const notes = (site.notes || []).map((note) => ({
    ...note,
    text: String(note.text || "").replace(
      /\/assets\/img\/uploads\/([A-Za-z0-9._-]+)(?:\?[^)\s]*)?/g,
      "/media/$1"
    ),
  }));
  return {
    about: site.about && Array.isArray(site.about.paragraphs) ? site.about : { paragraphs: [] },
    articles: site.articles || [],
    notes,
    timeline: site.timeline || [],
  };
}

export function sqlString(value) {
  return "'" + String(value == null ? "" : value).replaceAll("'", "''") + "'";
}

export function importSql(site) {
  const data = transformSite(site);
  const lines = ["DELETE FROM about;", "DELETE FROM articles;", "DELETE FROM notes;", "DELETE FROM timeline;"];
  lines.push(
    `INSERT INTO about (id, paragraphs, updated_at) VALUES (1, ${sqlString(JSON.stringify(data.about.paragraphs))}, ${sqlString(new Date().toISOString())});`
  );
  for (const note of data.notes) {
    lines.push(
      `INSERT INTO notes (id, date, text, tags, created_at, updated_at) VALUES (${sqlString(note.id)}, ${sqlString(note.date)}, ${sqlString(note.text)}, ${sqlString(JSON.stringify(note.tags || []))}, ${sqlString(note.date)}, ${sqlString(note.date)});`
    );
  }
  for (const item of data.timeline) {
    lines.push(
      `INSERT INTO timeline (id, date, text, kind) VALUES (${sqlString(item.id)}, ${sqlString(item.date)}, ${sqlString(item.text)}, ${sqlString(item.kind)});`
    );
  }
  return lines.join("\n");
}

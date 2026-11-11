CREATE TABLE IF NOT EXISTS view_counts (
  subject TEXT PRIMARY KEY,
  total INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS view_seen (
  subject TEXT NOT NULL,
  visitor TEXT NOT NULL,
  PRIMARY KEY (subject, visitor)
);

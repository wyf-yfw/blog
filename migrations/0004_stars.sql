-- GitHub star 快照：每天同步一次，页面只读这张表
CREATE TABLE IF NOT EXISTS stars (
  repo TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  starred_at TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stars_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  synced_at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  message TEXT NOT NULL DEFAULT ''
);

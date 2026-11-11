-- 关于页的年度目标：一年一份，每条可以标成完成
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  year INTEGER NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

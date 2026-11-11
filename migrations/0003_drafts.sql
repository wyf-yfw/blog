-- 文章草稿：写到一半可以先存着，下次接着写
-- draft_key = 'new'（还没发布过的新文章）或已有文章的 id
CREATE TABLE IF NOT EXISTS drafts (
  draft_key TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

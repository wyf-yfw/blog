-- 文章和手记的点赞。同一个人再点一次就取消
CREATE TABLE IF NOT EXISTS like_counts (
  subject TEXT PRIMARY KEY,
  total INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS like_seen (
  subject TEXT NOT NULL,
  visitor TEXT NOT NULL,
  PRIMARY KEY (subject, visitor)
);

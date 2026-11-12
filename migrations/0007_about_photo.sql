-- 关于页右侧的图，空着就不显示
ALTER TABLE about ADD COLUMN photo TEXT NOT NULL DEFAULT '';

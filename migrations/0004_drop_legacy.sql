-- Drop deprecated columns left behind after the design rewrite. SQLite 3.35+
-- supports ALTER TABLE … DROP COLUMN; Node's bundled sqlite is new enough on
-- every platform we ship to.
ALTER TABLE schedule_items DROP COLUMN completed;
ALTER TABLE day_bounds DROP COLUMN buffer_before;
ALTER TABLE day_bounds DROP COLUMN buffer_after;

-- 0002 already dropped this; re-drop in case any DB skipped that step.
DROP TABLE IF EXISTS date_overrides;

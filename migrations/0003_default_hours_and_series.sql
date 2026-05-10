-- Default waking range: 4:00am to 10:00pm for every weekday.
UPDATE day_bounds SET wake_minute = 240, sleep_minute = 1320;

-- Recurring item series: nullable id grouping schedule_items that should
-- behave as one. Indexed for the "find siblings" lookup in updateSeries.
ALTER TABLE schedule_items ADD COLUMN series_id TEXT;
CREATE INDEX IF NOT EXISTS idx_schedule_items_series_id
  ON schedule_items(series_id);

-- Auto-group existing duplicates: any (template_id, kind, title, category_id,
-- start_minute, end_minute) tuple that appears on 2+ different weekdays gets
-- a shared series_id. Idempotent because the WHERE clause skips rows that
-- already have a series_id, and the GROUP BY only emits a row when the tuple
-- still has 2+ ungrouped weekdays.
WITH duplicate_groups AS (
  SELECT template_id, kind, title, category_id, start_minute, end_minute,
         lower(hex(randomblob(16))) AS new_series_id
  FROM schedule_items
  WHERE series_id IS NULL
  GROUP BY template_id, kind, title, category_id, start_minute, end_minute
  HAVING COUNT(DISTINCT weekday) >= 2
)
UPDATE schedule_items
SET series_id = (
  SELECT new_series_id FROM duplicate_groups
  WHERE duplicate_groups.template_id   = schedule_items.template_id
    AND duplicate_groups.kind          = schedule_items.kind
    AND duplicate_groups.title         = schedule_items.title
    AND duplicate_groups.category_id   = schedule_items.category_id
    AND duplicate_groups.start_minute  = schedule_items.start_minute
    AND IFNULL(duplicate_groups.end_minute, -1) = IFNULL(schedule_items.end_minute, -1)
)
WHERE series_id IS NULL
  AND EXISTS (
    SELECT 1 FROM duplicate_groups
    WHERE duplicate_groups.template_id   = schedule_items.template_id
      AND duplicate_groups.kind          = schedule_items.kind
      AND duplicate_groups.title         = schedule_items.title
      AND duplicate_groups.category_id   = schedule_items.category_id
      AND duplicate_groups.start_minute  = schedule_items.start_minute
      AND IFNULL(duplicate_groups.end_minute, -1) = IFNULL(schedule_items.end_minute, -1)
  );

-- Design-led rewrite, phase 1.
-- Adds per-category budget metadata, makes pin durations explicit (so budget
-- math is uniform across kinds), and drops the descoped date_overrides table.
-- "Soft drops" of completed and buffer_before/buffer_after happen in code; the
-- columns stay in place to keep this migration trivially reversible.

ALTER TABLE categories
  ADD COLUMN budget_mode TEXT NOT NULL DEFAULT 'observation'
  CHECK (budget_mode IN ('target', 'minimum', 'observation'));

ALTER TABLE categories ADD COLUMN target_minutes INTEGER;

UPDATE schedule_items
   SET end_minute = start_minute + 2
 WHERE kind = 'pin' AND end_minute IS NULL;

DROP TABLE IF EXISTS date_overrides;

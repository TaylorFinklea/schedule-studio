-- Personal task pool. Drag a todo into the schedule grid to spawn an item;
-- the todo persists until the user deletes it manually (no auto-delete on drop).
-- duration_minutes is the preset block length (NULL = use UI default of 60);
-- pins ignore it and clamp to the pin range at item-create time.
CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('block', 'pin')) DEFAULT 'block',
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  duration_minutes INTEGER,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

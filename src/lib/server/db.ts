import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  BudgetMode,
  CategoryCreateInput,
  CategoryUpdate,
  DayBounds,
  ItemInput,
  ItemKind,
  ScheduleItem,
  ScheduleVersion,
  Todo,
  TodoInput,
  VersionInput,
  Weekday,
  WeekView,
} from "$lib/types";
import { PIN_DEFAULT_MINUTES, PIN_MAX_MINUTES } from "$lib/types";
import {
  calculateCategoryBudgets,
  calculateDailyTotals,
  calculateWeeklyTotals,
  clampMinute,
  DAY_NAMES,
  dayLabel,
  findOverlaps,
  isoDate,
  SNAP_MINUTES,
  snapMinute,
  weekStartFor,
} from "$lib/schedule";

type CategoryRow = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  archived: 0 | 1;
  budget_mode: BudgetMode;
  target_minutes: number | null;
  parent_id: string | null;
};

type BoundsRow = {
  template_id: string;
  weekday: Weekday;
  wake_minute: number;
  sleep_minute: number;
};

type TemplateRow = {
  id: string;
  name: string;
  week_start_date: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  template_id: string;
  kind: "block" | "pin";
  title: string;
  weekday: Weekday;
  start_minute: number;
  end_minute: number | null;
  category_id: string;
  notes: string;
  source: "template" | "override";
  series_id: string | null;
};

type TodoRow = {
  id: string;
  title: string;
  kind: ItemKind;
  category_id: string | null;
  duration_minutes: number | null;
  sort_order: number;
};

function rowToTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    categoryId: row.category_id,
    durationMinutes: row.duration_minutes,
    sortOrder: row.sort_order,
  };
}

const DEFAULT_TEMPLATE_ID = "template-week";
const MIGRATIONS = [
  "0001_initial",
  "0002_redesign",
  "0003_default_hours_and_series",
  "0004_drop_legacy",
  "0005_todos",
  "0006_subcategories",
  "0007_template_week_start",
] as const;

type SqliteDatabase = InstanceType<typeof DatabaseSync>;

let connection: SqliteDatabase | null = null;

function databasePath() {
  return resolve(
    process.env.SCHEDULE_STUDIO_DB ?? ".local/schedule-studio.sqlite",
  );
}

export function getDb() {
  if (connection) return connection;

  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });
  connection = new DatabaseSync(path);
  connection.exec("PRAGMA journal_mode = WAL");
  connection.exec("PRAGMA foreign_keys = ON");
  runMigrations(connection);
  seedIfEmpty(connection);
  groupDuplicateItems(connection);
  return connection;
}

// Groups identical items across weekdays into a series. Idempotent: only
// affects rows whose series_id is still NULL, so it can run after every
// boot. Mirrors the auto-group SQL in migration 0003 — that migration
// runs before the seed inserts data, so we re-run the same logic here.
function groupDuplicateItems(db: SqliteDatabase) {
  db.exec(`
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
  `);
}

function runMigrations(db: SqliteDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const checkApplied = db.prepare(
    "SELECT version FROM schema_migrations WHERE version = ?",
  );
  const recordApplied = db.prepare(
    "INSERT INTO schema_migrations (version) VALUES (?)",
  );

  for (const version of MIGRATIONS) {
    if (checkApplied.get(version)) continue;
    const sql = readFileSync(
      join(process.cwd(), "migrations", `${version}.sql`),
      "utf8",
    );
    db.exec(sql);
    recordApplied.run(version);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const hasActive = db
    .prepare("SELECT value FROM app_settings WHERE key = 'active_template_id'")
    .get();
  if (!hasActive) {
    db.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?)").run(
      "active_template_id",
      DEFAULT_TEMPLATE_ID,
    );
  }
  const hasDefault = db
    .prepare("SELECT value FROM app_settings WHERE key = 'default_template_id'")
    .get();
  if (!hasDefault) {
    db.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?)").run(
      "default_template_id",
      DEFAULT_TEMPLATE_ID,
    );
  }
}

function seedIfEmpty(db: SqliteDatabase) {
  const categoryCount = db
    .prepare("SELECT COUNT(*) AS count FROM categories")
    .get() as { count: number };
  if (categoryCount.count > 0) return;

  const categories = [
    ["deep-work", "Deep work", "#bb9af7"],
    ["admin", "Admin", "#e0af68"],
    ["meals", "Meals", "#ff9e64"],
    ["exercise", "Exercise", "#9ece6a"],
    ["rest", "Rest", "#f7768e"],
    ["family", "Family", "#2ac3de"],
    ["chores", "Chores", "#73daca"],
    ["focus", "Focus", "#7aa2f7"],
  ];

  const insertCategory = db.prepare(
    "INSERT INTO categories (id, name, color, sort_order) VALUES (?, ?, ?, ?)",
  );
  categories.forEach(([id, name, color], index) =>
    insertCategory.run(id, name, color, index + 1),
  );

  db.prepare(
    "INSERT INTO templates (id, name, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
  ).run(DEFAULT_TEMPLATE_ID, "Fictional planning template");

  const bounds = db.prepare(
    "INSERT INTO day_bounds (template_id, weekday, wake_minute, sleep_minute) VALUES (?, ?, ?, ?)",
  );
  const wakeByDay = [240, 240, 240, 240, 240, 240, 240];
  const sleepByDay = [1320, 1320, 1320, 1320, 1320, 1320, 1320];
  for (let weekday = 1; weekday <= 7; weekday++) {
    bounds.run(
      DEFAULT_TEMPLATE_ID,
      weekday,
      wakeByDay[weekday - 1],
      sleepByDay[weekday - 1],
    );
  }

  const add = (item: Omit<ItemInput, "id">) =>
    upsertItem({ ...item, id: randomUUID() });
  add({
    kind: "block",
    title: "Deep work",
    weekday: 1,
    startMinute: 420,
    endMinute: 480,
    categoryId: "deep-work",
  });
  add({
    kind: "pin",
    title: "Start laundry",
    weekday: 1,
    startMinute: 495,
    categoryId: "chores",
  });
  add({
    kind: "block",
    title: "Exercise",
    weekday: 1,
    startMinute: 540,
    endMinute: 600,
    categoryId: "exercise",
  });
  add({
    kind: "block",
    title: "Admin",
    weekday: 1,
    startMinute: 615,
    endMinute: 660,
    categoryId: "admin",
  });
  add({
    kind: "block",
    title: "Meals",
    weekday: 1,
    startMinute: 720,
    endMinute: 765,
    categoryId: "meals",
  });
  add({
    kind: "block",
    title: "Deep work",
    weekday: 1,
    startMinute: 780,
    endMinute: 900,
    categoryId: "deep-work",
  });
  add({
    kind: "pin",
    title: "Pay credit card",
    weekday: 1,
    startMinute: 945,
    categoryId: "focus",
  });
  add({
    kind: "block",
    title: "Family",
    weekday: 1,
    startMinute: 1050,
    endMinute: 1110,
    categoryId: "family",
  });
  add({
    kind: "block",
    title: "Meals",
    weekday: 1,
    startMinute: 1140,
    endMinute: 1200,
    categoryId: "meals",
  });
  add({
    kind: "pin",
    title: "Read",
    weekday: 1,
    startMinute: 1260,
    categoryId: "focus",
  });

  for (const weekday of [2, 3, 4, 5, 6, 7] as Weekday[]) {
    add({
      kind: "block",
      title: weekday === 4 ? "Deep work" : "Admin",
      weekday,
      startMinute: weekday === 4 ? 420 : 435,
      endMinute: weekday === 4 ? 600 : 480,
      categoryId: weekday === 4 ? "deep-work" : "admin",
    });
    add({
      kind: "block",
      title: "Exercise",
      weekday,
      startMinute: weekday > 5 ? 480 : 540,
      endMinute: weekday > 5 ? 540 : 600,
      categoryId: "exercise",
    });
    add({
      kind: "block",
      title: "Meals",
      weekday,
      startMinute: 720,
      endMinute: 765,
      categoryId: "meals",
    });
    add({
      kind: "block",
      title: "Deep work",
      weekday,
      startMinute: 780,
      endMinute: weekday === 2 ? 870 : 900,
      categoryId: "deep-work",
    });
    add({
      kind: "block",
      title: "Family",
      weekday,
      startMinute: weekday === 6 ? 1230 : 900,
      endMinute: weekday === 6 ? 1320 : 960,
      categoryId: "family",
    });
    add({
      kind: "block",
      title: "Meals",
      weekday,
      startMinute: 1140,
      endMinute: weekday > 5 ? 1200 : 1200,
      categoryId: "meals",
    });
    add({
      kind: "block",
      title: "Rest",
      weekday,
      startMinute: weekday > 5 ? 1200 : 1290,
      endMinute: weekday > 5 ? 1290 : 1350,
      categoryId: "rest",
    });
  }

  add({
    kind: "block",
    title: "Rest",
    weekday: 4,
    startMinute: 570,
    endMinute: 630,
    categoryId: "rest",
  });
  add({
    kind: "pin",
    title: "Call mom",
    weekday: 4,
    startMinute: 1050,
    categoryId: "focus",
  });
}

function getSetting(db: SqliteDatabase, key: string, fallback: string) {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

function setSetting(db: SqliteDatabase, key: string, value: string) {
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

function activeTemplateId(db: SqliteDatabase) {
  const id = getSetting(db, "active_template_id", DEFAULT_TEMPLATE_ID);
  const exists = db.prepare("SELECT id FROM templates WHERE id = ?").get(id);
  if (exists) return id;
  setSetting(db, "active_template_id", DEFAULT_TEMPLATE_ID);
  return DEFAULT_TEMPLATE_ID;
}

function defaultTemplateId(db: SqliteDatabase) {
  return getSetting(db, "default_template_id", DEFAULT_TEMPLATE_ID);
}

function templateSummaries(db: SqliteDatabase): ScheduleVersion[] {
  const activeId = activeTemplateId(db);
  const defaultId = defaultTemplateId(db);
  return db
    .prepare(
      `SELECT
        templates.id,
        templates.name,
        templates.week_start_date,
        templates.updated_at,
        COUNT(schedule_items.id) AS item_count,
        COALESCE(SUM(CASE
          WHEN schedule_items.kind = 'block' AND schedule_items.end_minute IS NOT NULL
          THEN schedule_items.end_minute - schedule_items.start_minute
          ELSE 0
        END), 0) AS total_minutes
       FROM templates
       LEFT JOIN schedule_items ON schedule_items.template_id = templates.id
       GROUP BY templates.id
       ORDER BY templates.updated_at DESC, templates.created_at DESC`,
    )
    .all()
    .map((row) => {
      const typed = row as {
        id: string;
        name: string;
        week_start_date: string | null;
        updated_at: string;
        item_count: number;
        total_minutes: number;
      };
      return {
        id: typed.id,
        name: typed.name,
        weekStartDate: typed.week_start_date,
        isActive: typed.id === activeId,
        isDefault: typed.id === defaultId,
        itemCount: typed.item_count,
        totalMinutes: typed.total_minutes,
        updatedAt: typed.updated_at,
      };
    });
}

function rowToItem(row: ItemRow): ScheduleItem {
  return {
    id: row.id,
    templateId: row.template_id,
    kind: row.kind,
    title: row.title,
    weekday: row.weekday,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    categoryId: row.category_id,
    notes: row.notes,
    source: row.source,
    seriesId: row.series_id,
  };
}

function listTodosInternal(db: SqliteDatabase): Todo[] {
  return (
    db
      .prepare(
        "SELECT id, title, kind, category_id, duration_minutes, sort_order FROM todos ORDER BY sort_order",
      )
      .all() as TodoRow[]
  ).map(rowToTodo);
}

export function listTodos(): Todo[] {
  return listTodosInternal(getDb());
}

export function createTodo(input: TodoInput): Todo {
  const db = getDb();
  const id = randomUUID();
  const maxSort = (
    db
      .prepare("SELECT COALESCE(MAX(sort_order), 0) AS max FROM todos")
      .get() as {
      max: number;
    }
  ).max;
  db.prepare(
    `INSERT INTO todos (id, title, kind, category_id, duration_minutes, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.title.trim() || "New todo",
    input.kind,
    input.categoryId ?? null,
    input.durationMinutes ?? null,
    maxSort + 1,
  );
  return rowToTodo(
    db.prepare("SELECT * FROM todos WHERE id = ?").get(id) as TodoRow,
  );
}

export function updateTodo(id: string, patch: Partial<TodoInput>): Todo | null {
  const db = getDb();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (patch.title !== undefined) {
    sets.push("title = ?");
    values.push(patch.title.trim() || "New todo");
  }
  if (patch.kind !== undefined) {
    sets.push("kind = ?");
    values.push(patch.kind);
  }
  if (patch.categoryId !== undefined) {
    sets.push("category_id = ?");
    values.push(patch.categoryId);
  }
  if (patch.durationMinutes !== undefined) {
    sets.push("duration_minutes = ?");
    values.push(patch.durationMinutes);
  }
  if (sets.length === 0) {
    const row = db.prepare("SELECT * FROM todos WHERE id = ?").get(id) as
      | TodoRow
      | undefined;
    return row ? rowToTodo(row) : null;
  }
  values.push(id);
  db.prepare(`UPDATE todos SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  const row = db.prepare("SELECT * FROM todos WHERE id = ?").get(id) as
    | TodoRow
    | undefined;
  return row ? rowToTodo(row) : null;
}

export function deleteTodo(id: string) {
  getDb().prepare("DELETE FROM todos WHERE id = ?").run(id);
}

export function reorderTodo(id: string, direction: "up" | "down") {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, sort_order FROM todos ORDER BY sort_order")
    .all() as { id: string; sort_order: number }[];
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) return;
  const me = rows[idx];
  const other = rows[swapIdx];
  db.exec("BEGIN");
  try {
    const update = db.prepare("UPDATE todos SET sort_order = ? WHERE id = ?");
    update.run(-1, me.id);
    update.run(me.sort_order, other.id);
    update.run(other.sort_order, me.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getWeekView(dateParam?: string): WeekView {
  const db = getDb();
  const activeId = activeTemplateId(db);
  const defaultId = defaultTemplateId(db);
  const template = db
    .prepare("SELECT * FROM templates WHERE id = ?")
    .get(activeId) as TemplateRow;
  const categories = (
    db
      .prepare("SELECT * FROM categories ORDER BY archived, sort_order")
      .all() as CategoryRow[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    archived: Boolean(row.archived),
    budgetMode: row.budget_mode,
    targetMinutes: row.target_minutes,
    parentId: row.parent_id,
  }));
  const boundsRows = db
    .prepare("SELECT * FROM day_bounds WHERE template_id = ? ORDER BY weekday")
    .all(template.id) as BoundsRow[];
  const bounds = new Map(boundsRows.map((row) => [row.weekday, row]));
  const items = (
    db
      .prepare(
        "SELECT * FROM schedule_items WHERE template_id = ? ORDER BY weekday, start_minute",
      )
      .all(template.id) as ItemRow[]
  ).map(rowToItem);
  const anchoredDate = dateParam ?? template.week_start_date;
  const start = anchoredDate
    ? weekStartFor(new Date(`${anchoredDate}T00:00:00`))
    : null;
  const end = start ? new Date(start) : null;
  if (start && end) end.setDate(start.getDate() + 6);

  const days = ([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((weekday) => {
    const bound = bounds.get(weekday);
    if (!bound) throw new Error(`Missing day bounds for weekday ${weekday}`);
    const dayItems = items.filter((item) => item.weekday === weekday);
    return {
      weekday,
      dateLabel: dayLabel(weekday, start ? isoDate(start) : null),
      dayName: DAY_NAMES[weekday - 1],
      bounds: {
        weekday,
        wakeMinute: bound.wake_minute,
        sleepMinute: bound.sleep_minute,
      },
      items: dayItems,
      totalMinutes: dayItems.reduce(
        (sum, item) =>
          sum +
          (item.endMinute !== null
            ? Math.max(0, item.endMinute - item.startMinute)
            : 0),
        0,
      ),
    };
  });

  const weeklyTotals = calculateWeeklyTotals(items, categories);
  return {
    templateId: template.id,
    templateName: template.name,
    defaultTemplateId: defaultId,
    weekStart: start ? isoDate(start) : null,
    weekEnd: end ? isoDate(end) : null,
    versions: templateSummaries(db),
    days,
    categories,
    weeklyTotals,
    dailyTotals: calculateDailyTotals(items),
    categoryBudgets: calculateCategoryBudgets(weeklyTotals, categories),
    overlapWarnings: findOverlaps(items),
    todos: listTodosInternal(db),
    categoryUsage: categoryUsageMap(db),
  };
}

function categoryUsageMap(
  db: ReturnType<typeof getDb>,
): Record<string, number> {
  const usage: Record<string, number> = {};
  const itemRows = db
    .prepare(
      "SELECT category_id AS id, COUNT(*) AS n FROM schedule_items WHERE category_id IS NOT NULL GROUP BY category_id",
    )
    .all() as { id: string; n: number }[];
  const todoRows = db
    .prepare(
      "SELECT category_id AS id, COUNT(*) AS n FROM todos WHERE category_id IS NOT NULL GROUP BY category_id",
    )
    .all() as { id: string; n: number }[];
  // Parents with subcategories also can't be deleted, so surface them as
  // "in use" to keep the Delete button disabled in the UI.
  const childRows = db
    .prepare(
      "SELECT parent_id AS id, COUNT(*) AS n FROM categories WHERE parent_id IS NOT NULL GROUP BY parent_id",
    )
    .all() as { id: string; n: number }[];
  for (const row of itemRows) usage[row.id] = (usage[row.id] ?? 0) + row.n;
  for (const row of todoRows) usage[row.id] = (usage[row.id] ?? 0) + row.n;
  for (const row of childRows) usage[row.id] = (usage[row.id] ?? 0) + row.n;
  return usage;
}

export function upsertItem(input: ItemInput): ScheduleItem {
  const db = getDb();
  const id = input.id ?? randomUUID();
  const existing = input.id
    ? (db
        .prepare(
          "SELECT template_id, series_id FROM schedule_items WHERE id = ?",
        )
        .get(input.id) as
        | { template_id: string; series_id: string | null }
        | undefined)
    : undefined;
  const templateId = existing?.template_id ?? activeTemplateId(db);
  const seriesId =
    input.seriesId !== undefined
      ? input.seriesId
      : (existing?.series_id ?? null);
  const snappedStart = snapMinute(input.startMinute);
  const startMinute =
    input.kind === "block"
      ? Math.min(24 * 60 - SNAP_MINUTES, snappedStart)
      : snappedStart;
  let endMinute: number;
  if (input.kind === "block") {
    endMinute = Math.max(
      startMinute + SNAP_MINUTES,
      snapMinute(clampMinute(input.endMinute ?? startMinute + 60)),
    );
  } else {
    const requestedDuration =
      input.endMinute != null
        ? input.endMinute - startMinute
        : PIN_DEFAULT_MINUTES;
    const duration = Math.max(
      1,
      Math.min(PIN_MAX_MINUTES, Math.round(requestedDuration)),
    );
    endMinute = startMinute + duration;
  }
  db.prepare(
    `INSERT INTO schedule_items
      (id, template_id, kind, title, weekday, start_minute, end_minute, category_id, notes, source, series_id, created_at, updated_at)
     VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, 'template', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      title = excluded.title,
      weekday = excluded.weekday,
      start_minute = excluded.start_minute,
      end_minute = excluded.end_minute,
      category_id = excluded.category_id,
      notes = excluded.notes,
      series_id = excluded.series_id,
      updated_at = CURRENT_TIMESTAMP`,
  ).run(
    id,
    templateId,
    input.kind,
    input.title.trim() || (input.kind === "pin" ? "New pin" : "New block"),
    input.weekday,
    startMinute,
    endMinute,
    input.categoryId,
    input.notes ?? "",
    seriesId,
  );
  return rowToItem(
    db.prepare("SELECT * FROM schedule_items WHERE id = ?").get(id) as ItemRow,
  );
}

export function createItems(
  input: ItemInput,
  weekdays: Weekday[],
): ScheduleItem[] {
  const unique = Array.from(new Set(weekdays)).sort() as Weekday[];
  if (unique.length === 0) return [];
  const seriesId = unique.length >= 2 ? randomUUID() : null;
  return unique.map((weekday) =>
    upsertItem({
      ...input,
      id: undefined,
      weekday,
      seriesId,
    }),
  );
}

export function updateSeries(
  seriesId: string,
  patch: ItemInput,
  targetWeekdays: Weekday[],
  templateId: string,
): ScheduleItem[] {
  const db = getDb();
  // Series IDs only have meaning within a single template. A duplicate
  // template inherits items but each copy is its own sandbox — never reach
  // across templates here.
  const siblings = db
    .prepare(
      "SELECT * FROM schedule_items WHERE series_id = ? AND template_id = ?",
    )
    .all(seriesId, templateId) as ItemRow[];
  if (siblings.length === 0) return [];

  const desired = new Set(targetWeekdays);
  for (const row of siblings) {
    if (!desired.has(row.weekday)) {
      db.prepare("DELETE FROM schedule_items WHERE id = ?").run(row.id);
    }
  }

  const existingByWeekday = new Map<Weekday, ItemRow>();
  for (const row of siblings) {
    if (desired.has(row.weekday)) existingByWeekday.set(row.weekday, row);
  }

  const sortedTargets = Array.from(desired).sort() as Weekday[];
  const survivors = sortedTargets.map((weekday) => {
    const existing = existingByWeekday.get(weekday);
    return upsertItem({
      ...patch,
      id: existing?.id,
      weekday,
      seriesId,
    });
  });

  // A series of one is just a standalone item — drop the series_id so the
  // visual marker disappears and future edits don't carry series semantics.
  if (survivors.length === 1) {
    detachItem(survivors[0].id);
    survivors[0] = { ...survivors[0], seriesId: null };
  }
  return survivors;
}

export function detachItem(id: string) {
  getDb()
    .prepare("UPDATE schedule_items SET series_id = NULL WHERE id = ?")
    .run(id);
}

export function getItemTemplateId(id: string): string | null {
  const row = getDb()
    .prepare("SELECT template_id FROM schedule_items WHERE id = ?")
    .get(id) as { template_id: string } | undefined;
  return row?.template_id ?? null;
}

export function deleteItem(id: string) {
  getDb().prepare("DELETE FROM schedule_items WHERE id = ?").run(id);
}

export function deleteSeries(seriesId: string, templateId: string) {
  getDb()
    .prepare(
      "DELETE FROM schedule_items WHERE series_id = ? AND template_id = ?",
    )
    .run(seriesId, templateId);
}

export class CategoryHierarchyError extends Error {
  constructor(message = "Invalid category hierarchy") {
    super(message);
    this.name = "CategoryHierarchyError";
  }
}

// A category may be nested at most one level deep. `parentId` must reference a
// different, existing, top-level category, and the category being reparented
// must not itself already have children (that would create a third level).
function assertValidParent(
  db: SqliteDatabase,
  categoryId: string | null,
  parentId: string,
) {
  if (parentId === categoryId) {
    throw new CategoryHierarchyError("A category cannot be its own parent");
  }
  const parent = db
    .prepare("SELECT parent_id FROM categories WHERE id = ?")
    .get(parentId) as { parent_id: string | null } | undefined;
  if (!parent) {
    throw new CategoryHierarchyError("Parent category not found");
  }
  if (parent.parent_id !== null) {
    throw new CategoryHierarchyError("Subcategories cannot be nested further");
  }
  if (categoryId !== null) {
    const childCount = (
      db
        .prepare("SELECT COUNT(*) AS count FROM categories WHERE parent_id = ?")
        .get(categoryId) as { count: number }
    ).count;
    if (childCount > 0) {
      throw new CategoryHierarchyError(
        "A category with subcategories cannot become a subcategory",
      );
    }
  }
}

export function updateCategory(input: CategoryUpdate) {
  const db = getDb();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (input.parentId !== undefined) {
    if (input.parentId !== null) {
      assertValidParent(db, input.id, input.parentId);
    }
    sets.push("parent_id = ?");
    values.push(input.parentId);
    // Place the moved category at the end of its destination sibling group so
    // its old (now foreign) sort_order can't collide with an existing sibling.
    const destMax = (
      db
        .prepare(
          input.parentId === null
            ? "SELECT COALESCE(MAX(sort_order), 0) AS max FROM categories WHERE parent_id IS NULL AND id <> ?"
            : "SELECT COALESCE(MAX(sort_order), 0) AS max FROM categories WHERE parent_id = ? AND id <> ?",
        )
        .get(
          ...(input.parentId === null
            ? [input.id]
            : [input.parentId, input.id]),
        ) as { max: number }
    ).max;
    sets.push("sort_order = ?");
    values.push(destMax + 1);
  }
  if (input.name !== undefined) {
    sets.push("name = ?");
    values.push(input.name);
  }
  if (input.color !== undefined) {
    sets.push("color = ?");
    values.push(input.color);
  }
  if (input.budgetMode !== undefined) {
    sets.push("budget_mode = ?");
    values.push(input.budgetMode);
  }
  if (input.targetMinutes !== undefined) {
    sets.push("target_minutes = ?");
    values.push(input.targetMinutes);
  }
  if (input.archived !== undefined) {
    sets.push("archived = ?");
    values.push(input.archived ? 1 : 0);
  }
  if (input.sortOrder !== undefined) {
    sets.push("sort_order = ?");
    values.push(input.sortOrder);
  }
  if (sets.length === 0) return;
  values.push(input.id);
  db.prepare(`UPDATE categories SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values,
  );
}

export function createCategory(input: CategoryCreateInput) {
  const db = getDb();
  const parentId = input.parentId ?? null;
  if (parentId !== null) {
    assertValidParent(db, null, parentId);
  }
  const id = randomUUID();
  // Sort order is scoped to siblings so reordering stays within a parent.
  const maxSort = (
    db
      .prepare(
        parentId === null
          ? "SELECT COALESCE(MAX(sort_order), 0) AS max FROM categories WHERE parent_id IS NULL"
          : "SELECT COALESCE(MAX(sort_order), 0) AS max FROM categories WHERE parent_id = ?",
      )
      .get(...(parentId === null ? [] : [parentId])) as {
      max: number;
    }
  ).max;
  db.prepare(
    `INSERT INTO categories (id, name, color, sort_order, archived, budget_mode, target_minutes, parent_id)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
  ).run(
    id,
    input.name.trim() || "New category",
    input.color,
    maxSort + 1,
    input.budgetMode ?? "observation",
    input.targetMinutes ?? null,
    parentId,
  );
  return id;
}

export function reorderCategory(id: string, direction: "up" | "down") {
  const db = getDb();
  const target = db
    .prepare("SELECT parent_id FROM categories WHERE id = ?")
    .get(id) as { parent_id: string | null } | undefined;
  if (!target) return;
  // Reorder only swaps with siblings sharing the same parent.
  const parentId = target.parent_id;
  const active = db
    .prepare(
      parentId === null
        ? "SELECT id, sort_order FROM categories WHERE archived = 0 AND parent_id IS NULL ORDER BY sort_order"
        : "SELECT id, sort_order FROM categories WHERE archived = 0 AND parent_id = ? ORDER BY sort_order",
    )
    .all(...(parentId === null ? [] : [parentId])) as {
    id: string;
    sort_order: number;
  }[];
  const idx = active.findIndex((c) => c.id === id);
  if (idx < 0) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= active.length) return;
  const me = active[idx];
  const other = active[swapIdx];
  // Two-step swap with a temporary value avoids any uniqueness collisions
  // and guarantees ordering even if a future migration adds a unique
  // constraint on sort_order.
  db.exec("BEGIN");
  try {
    const update = db.prepare(
      "UPDATE categories SET sort_order = ? WHERE id = ?",
    );
    update.run(-1, me.id);
    update.run(me.sort_order, other.id);
    update.run(other.sort_order, me.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export class CategoryInUseError extends Error {
  constructor() {
    super("Category in use");
    this.name = "CategoryInUseError";
  }
}

export function deleteCategory(id: string) {
  const db = getDb();
  const items = db
    .prepare(
      "SELECT COUNT(*) AS count FROM schedule_items WHERE category_id = ?",
    )
    .get(id) as { count: number };
  const todos = db
    .prepare("SELECT COUNT(*) AS count FROM todos WHERE category_id = ?")
    .get(id) as { count: number };
  const children = db
    .prepare("SELECT COUNT(*) AS count FROM categories WHERE parent_id = ?")
    .get(id) as { count: number };
  if (items.count + todos.count + children.count > 0) {
    throw new CategoryInUseError();
  }
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
}

export function updateDayBounds(input: DayBounds) {
  const db = getDb();
  db.prepare(
    `UPDATE day_bounds SET wake_minute = ?, sleep_minute = ?
       WHERE template_id = ? AND weekday = ?`,
  ).run(
    input.wakeMinute,
    input.sleepMinute,
    activeTemplateId(db),
    input.weekday,
  );
}

export function updateAllDayBounds(wakeMinute: number, sleepMinute: number) {
  const db = getDb();
  db.prepare(
    `UPDATE day_bounds SET wake_minute = ?, sleep_minute = ?
       WHERE template_id = ?`,
  ).run(wakeMinute, sleepMinute, activeTemplateId(db));
}

export function createVersion(input: VersionInput): ScheduleVersion {
  const db = getDb();
  const sourceId = input.sourceTemplateId ?? activeTemplateId(db);
  const source = db
    .prepare("SELECT * FROM templates WHERE id = ?")
    .get(sourceId) as TemplateRow | undefined;
  if (!source) throw new Error("Source schedule version not found");

  const id = randomUUID();
  const name = input.name.trim() || `${source.name} copy`;
  db.exec("BEGIN");
  try {
    db.prepare(
      "INSERT INTO templates (id, name, week_start_date, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    ).run(id, name, source.week_start_date);
    const bounds = db
      .prepare("SELECT * FROM day_bounds WHERE template_id = ?")
      .all(sourceId) as BoundsRow[];
    const insertBounds = db.prepare(
      "INSERT INTO day_bounds (template_id, weekday, wake_minute, sleep_minute) VALUES (?, ?, ?, ?)",
    );
    bounds.forEach((row) =>
      insertBounds.run(id, row.weekday, row.wake_minute, row.sleep_minute),
    );
    const items = db
      .prepare("SELECT * FROM schedule_items WHERE template_id = ?")
      .all(sourceId) as ItemRow[];
    const insertItem = db.prepare(
      `INSERT INTO schedule_items
        (id, template_id, kind, title, weekday, start_minute, end_minute, category_id, notes, source, series_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );
    // Regenerate series IDs in the copy so it's a true sandbox; sharing
    // series IDs across templates means a series edit on one template would
    // mutate the other.
    const seriesIdMap = new Map<string, string>();
    const remapSeries = (oldId: string | null): string | null => {
      if (!oldId) return null;
      const cached = seriesIdMap.get(oldId);
      if (cached) return cached;
      const fresh = randomUUID();
      seriesIdMap.set(oldId, fresh);
      return fresh;
    };
    items.forEach((item) =>
      insertItem.run(
        randomUUID(),
        id,
        item.kind,
        item.title,
        item.weekday,
        item.start_minute,
        item.end_minute,
        item.category_id,
        item.notes,
        item.source,
        remapSeries(item.series_id),
      ),
    );
    setSetting(db, "active_template_id", id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return templateSummaries(db).find((version) => version.id === id)!;
}

export function activateVersion(id: string) {
  const db = getDb();
  const exists = db.prepare("SELECT id FROM templates WHERE id = ?").get(id);
  if (!exists) throw new Error("Schedule version not found");
  setSetting(db, "active_template_id", id);
}

export function setDefaultVersion(id: string) {
  const db = getDb();
  const exists = db.prepare("SELECT id FROM templates WHERE id = ?").get(id);
  if (!exists) throw new Error("Schedule version not found");
  setSetting(db, "default_template_id", id);
}

export function renameVersion(id: string, name: string) {
  const db = getDb();
  db.prepare(
    "UPDATE templates SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(name.trim() || "Untitled schedule", id);
}

export function updateVersionWeekStart(
  id: string,
  weekStartDate: string | null,
) {
  const db = getDb();
  const normalized = weekStartDate
    ? isoDate(weekStartFor(new Date(`${weekStartDate}T00:00:00`)))
    : null;
  db.prepare(
    "UPDATE templates SET week_start_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(normalized, id);
}

export function deleteVersion(id: string) {
  const db = getDb();
  if (id === defaultTemplateId(db)) {
    throw new Error("The default schedule version cannot be deleted");
  }
  db.prepare("DELETE FROM templates WHERE id = ?").run(id);
  if (activeTemplateId(db) === id) {
    setSetting(db, "active_template_id", defaultTemplateId(db));
  }
}

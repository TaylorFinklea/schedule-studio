import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  DayBounds,
  ItemInput,
  ScheduleItem,
  Weekday,
  WeekView,
} from "$lib/types";
import {
  calculateDailyTotals,
  calculateWeeklyTotals,
  DAY_NAMES,
  findOverlaps,
  isoDate,
  weekStartFor,
} from "$lib/schedule";

type CategoryRow = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  archived: 0 | 1;
};

type BoundsRow = {
  template_id: string;
  weekday: Weekday;
  wake_minute: number;
  sleep_minute: number;
  buffer_before: number;
  buffer_after: number;
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
  completed: 0 | 1;
  source: "template" | "override";
};

const DEFAULT_TEMPLATE_ID = "template-week";
const MIGRATION_VERSION = "0001_initial";

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
  return connection;
}

function runMigrations(db: SqliteDatabase) {
  const migration = readFileSync(
    join(process.cwd(), "migrations", "0001_initial.sql"),
    "utf8",
  );
  db.exec(migration);
  const exists = db
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(MIGRATION_VERSION);
  if (!exists) {
    db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(
      MIGRATION_VERSION,
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
  ).run(DEFAULT_TEMPLATE_ID, "Template Week");

  const bounds = db.prepare(
    "INSERT INTO day_bounds (template_id, weekday, wake_minute, sleep_minute, buffer_before, buffer_after) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const sleepByDay = [1380, 1395, 1380, 1380, 1365, 1410, 1410];
  const wakeByDay = [390, 405, 390, 390, 375, 450, 450];
  for (let weekday = 1; weekday <= 7; weekday++) {
    bounds.run(
      DEFAULT_TEMPLATE_ID,
      weekday,
      wakeByDay[weekday - 1],
      sleepByDay[weekday - 1],
      60,
      60,
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
    completed: Boolean(row.completed),
    source: row.source,
  };
}

export function getWeekView(dateParam?: string): WeekView {
  const db = getDb();
  const template = db
    .prepare("SELECT id, name FROM templates ORDER BY created_at LIMIT 1")
    .get() as { id: string; name: string };
  const categories = (
    db
      .prepare(
        "SELECT * FROM categories WHERE archived = 0 ORDER BY sort_order",
      )
      .all() as CategoryRow[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    archived: Boolean(row.archived),
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
  const start = weekStartFor(
    dateParam
      ? new Date(`${dateParam}T00:00:00`)
      : new Date("2026-04-27T00:00:00"),
  );
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const days = ([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((weekday) => {
    const date = new Date(start);
    date.setDate(start.getDate() + weekday - 1);
    const bound = bounds.get(weekday);
    if (!bound) throw new Error(`Missing day bounds for weekday ${weekday}`);
    const dayItems = items.filter((item) => item.weekday === weekday);
    return {
      weekday,
      dateLabel: `${DAY_NAMES[weekday - 1]} ${date.getMonth() + 1}/${date.getDate()}`,
      dayName: DAY_NAMES[weekday - 1],
      bounds: {
        weekday,
        wakeMinute: bound.wake_minute,
        sleepMinute: bound.sleep_minute,
        bufferBefore: bound.buffer_before,
        bufferAfter: bound.buffer_after,
      },
      items: dayItems,
      totalMinutes: dayItems.reduce(
        (sum, item) =>
          sum +
          (item.kind === "block" && item.endMinute
            ? item.endMinute - item.startMinute
            : 0),
        0,
      ),
    };
  });

  return {
    templateId: template.id,
    templateName: template.name,
    weekStart: isoDate(start),
    weekEnd: isoDate(end),
    days,
    categories,
    weeklyTotals: calculateWeeklyTotals(items, categories),
    dailyTotals: calculateDailyTotals(items),
    overlapWarnings: findOverlaps(items),
  };
}

export function upsertItem(input: ItemInput): ScheduleItem {
  const db = getDb();
  const id = input.id ?? randomUUID();
  const endMinute =
    input.kind === "pin" ? null : (input.endMinute ?? input.startMinute + 60);
  db.prepare(
    `INSERT INTO schedule_items
      (id, template_id, kind, title, weekday, start_minute, end_minute, category_id, notes, completed, source, created_at, updated_at)
     VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'template', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      title = excluded.title,
      weekday = excluded.weekday,
      start_minute = excluded.start_minute,
      end_minute = excluded.end_minute,
      category_id = excluded.category_id,
      notes = excluded.notes,
      completed = excluded.completed,
      updated_at = CURRENT_TIMESTAMP`,
  ).run(
    id,
    DEFAULT_TEMPLATE_ID,
    input.kind,
    input.title.trim() || (input.kind === "pin" ? "New pin" : "New block"),
    input.weekday,
    input.startMinute,
    endMinute,
    input.categoryId,
    input.notes ?? "",
    input.completed ? 1 : 0,
  );
  return rowToItem(
    db.prepare("SELECT * FROM schedule_items WHERE id = ?").get(id) as ItemRow,
  );
}

export function deleteItem(id: string) {
  getDb().prepare("DELETE FROM schedule_items WHERE id = ?").run(id);
}

export function updateCategory(input: {
  id: string;
  name: string;
  color: string;
}) {
  getDb()
    .prepare("UPDATE categories SET name = ?, color = ? WHERE id = ?")
    .run(input.name, input.color, input.id);
}

export function updateDayBounds(input: DayBounds) {
  getDb()
    .prepare(
      `UPDATE day_bounds SET wake_minute = ?, sleep_minute = ?, buffer_before = ?, buffer_after = ?
       WHERE template_id = ? AND weekday = ?`,
    )
    .run(
      input.wakeMinute,
      input.sleepMinute,
      input.bufferBefore,
      input.bufferAfter,
      DEFAULT_TEMPLATE_ID,
      input.weekday,
    );
}

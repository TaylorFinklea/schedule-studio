import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  sortOrder: integer("sort_order").notNull(),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const templates = sqliteTable("templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const dayBounds = sqliteTable("day_bounds", {
  templateId: text("template_id").notNull(),
  weekday: integer("weekday").notNull(),
  wakeMinute: integer("wake_minute").notNull(),
  sleepMinute: integer("sleep_minute").notNull(),
  bufferBefore: integer("buffer_before").notNull(),
  bufferAfter: integer("buffer_after").notNull(),
});

export const scheduleItems = sqliteTable("schedule_items", {
  id: text("id").primaryKey(),
  templateId: text("template_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  weekday: integer("weekday").notNull(),
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute"),
  categoryId: text("category_id").notNull(),
  notes: text("notes").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull(),
  source: text("source").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

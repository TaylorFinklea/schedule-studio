import type {
  Category,
  CategoryTotal,
  DailyTotal,
  OverlapWarning,
  ScheduleItem,
  Weekday,
} from "$lib/types";

export const DAY_NAMES = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;
export const SNAP_MINUTES = 15;

export function clampMinute(minute: number): number {
  return Math.max(0, Math.min(24 * 60, minute));
}

export function snapMinute(minute: number): number {
  return clampMinute(Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES);
}

export function formatTime(minute: number): string {
  const normalized = ((minute % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${String(mins).padStart(2, "0")} ${suffix}`;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function itemDuration(item: ScheduleItem): number {
  if (item.kind !== "block" || item.endMinute === null) return 0;
  return Math.max(0, item.endMinute - item.startMinute);
}

export function calculateWeeklyTotals(
  items: ScheduleItem[],
  categories: Category[],
): CategoryTotal[] {
  return categories.map((category) => ({
    categoryId: category.id,
    minutes: items
      .filter((item) => item.categoryId === category.id)
      .reduce((sum, item) => sum + itemDuration(item), 0),
  }));
}

export function calculateDailyTotals(items: ScheduleItem[]): DailyTotal[] {
  return ([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((weekday) => ({
    weekday,
    minutes: items
      .filter((item) => item.weekday === weekday)
      .reduce((sum, item) => sum + itemDuration(item), 0),
  }));
}

export function findOverlaps(items: ScheduleItem[]): OverlapWarning[] {
  const warnings: OverlapWarning[] = [];
  const blocks = items.filter(
    (item) => item.kind === "block" && item.endMinute !== null,
  );

  for (const item of blocks) {
    for (const other of blocks) {
      if (
        item.id >= other.id ||
        item.weekday !== other.weekday ||
        other.endMinute === null ||
        item.endMinute === null
      ) {
        continue;
      }
      const overlaps =
        item.startMinute < other.endMinute &&
        other.startMinute < item.endMinute;
      if (!overlaps) continue;
      warnings.push({
        itemId: item.id,
        otherItemId: other.id,
        otherTitle: other.title,
      });
      warnings.push({
        itemId: other.id,
        otherItemId: item.id,
        otherTitle: item.title,
      });
    }
  }

  return warnings;
}

export function weekStartFor(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

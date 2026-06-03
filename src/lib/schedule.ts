import type {
  Category,
  CategoryBudget,
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
export const SNAP_MINUTES = 5;

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

export function parseTimeInput(value: string): number | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridiem = match[3]?.toLowerCase();
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes > 59) {
    return null;
  }

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "pm" && hours !== 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }

  return snapMinute(hours * 60 + minutes);
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function itemDuration(item: ScheduleItem): number {
  if (item.endMinute === null) return 0;
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

export function calculateCategoryBudgets(
  weeklyTotals: CategoryTotal[],
  categories: Category[],
): CategoryBudget[] {
  const actualFor = (id: string) =>
    weeklyTotals.find((total) => total.categoryId === id)?.minutes ?? 0;

  return categories.map((category) => {
    const actualMinutes = actualFor(category.id);
    // A parent rolls up its own actual plus every child's actual; a child
    // (or a parent with no children) rolls up to just its own.
    const rolledUpActualMinutes =
      category.parentId === null
        ? actualMinutes +
          categories
            .filter((other) => other.parentId === category.id)
            .reduce((sum, child) => sum + actualFor(child.id), 0)
        : actualMinutes;
    const targetMinutes = category.targetMinutes ?? null;
    const deltaMinutes =
      category.budgetMode === "observation" || targetMinutes === null
        ? null
        : rolledUpActualMinutes - targetMinutes;
    return {
      categoryId: category.id,
      parentId: category.parentId,
      mode: category.budgetMode,
      targetMinutes,
      actualMinutes,
      rolledUpActualMinutes,
      deltaMinutes,
    };
  });
}

/**
 * Non-archived categories in display order: each top-level parent immediately
 * followed by its non-archived children. Children of an archived parent are
 * omitted entirely (the parent hides its whole subtree from pickers). Used by
 * the budget strip and the item-editor category picker.
 */
export function orderedVisibleCategories(categories: Category[]): Category[] {
  const bySort = (a: Category, b: Category) => a.sortOrder - b.sortOrder;
  const parents = categories
    .filter((category) => category.parentId === null && !category.archived)
    .sort(bySort);
  const result: Category[] = [];
  for (const parent of parents) {
    result.push(parent);
    const children = categories
      .filter((child) => child.parentId === parent.id && !child.archived)
      .sort(bySort);
    result.push(...children);
  }
  return result;
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

export function dayLabel(weekday: Weekday, weekStart: string | null): string {
  const name = DAY_NAMES[weekday - 1];
  if (!weekStart) return name;
  const date = new Date(`${weekStart}T00:00:00`);
  date.setDate(date.getDate() + weekday - 1);
  return `${name} ${date.getMonth() + 1}/${date.getDate()}`;
}

export function weekRangeLabel(
  weekStart: string | null,
  weekEnd: string | null,
): string {
  if (!weekStart || !weekEnd) return "Weekly template";
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(`${weekEnd}T00:00:00`);
  return `${start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} - ${end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

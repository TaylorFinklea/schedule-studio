import { describe, expect, it } from "vitest";
import {
  calculateCategoryBudgets,
  calculateWeeklyTotals,
  dayLabel,
  findOverlaps,
  formatDuration,
  formatTime,
  orderedVisibleCategories,
  parseTimeInput,
  weekRangeLabel,
  snapMinute,
} from "$lib/schedule";
import type { Category, ScheduleItem } from "$lib/types";

function cat(
  id: string,
  parentId: string | null,
  sortOrder: number,
  archived = false,
): Category {
  return {
    id,
    name: id,
    color: "#7aa2f7",
    sortOrder,
    archived,
    budgetMode: "observation",
    targetMinutes: null,
    parentId,
  };
}

const categories: Category[] = [
  {
    id: "work",
    name: "Work",
    color: "#8b5cf6",
    sortOrder: 1,
    archived: false,
    budgetMode: "target",
    targetMinutes: 600,
    parentId: null,
  },
  {
    id: "rest",
    name: "Rest",
    color: "#fb7185",
    sortOrder: 2,
    archived: false,
    budgetMode: "observation",
    targetMinutes: null,
    parentId: null,
  },
];

const base = {
  templateId: "default",
  notes: "",
  source: "template" as const,
  seriesId: null,
};

describe("schedule helpers", () => {
  it("snaps to the nearest 5-minute increment", () => {
    expect(snapMinute(367)).toBe(365);
    expect(snapMinute(368)).toBe(370);
  });

  it("formats time and duration", () => {
    expect(formatTime(0)).toBe("12:00 AM");
    expect(formatTime(13 * 60 + 15)).toBe("1:15 PM");
    expect(formatDuration(135)).toBe("2h 15m");
  });

  it("parses human-readable time input", () => {
    expect(parseTimeInput("4:25 AM")).toBe(265);
    expect(parseTimeInput("12:00 PM")).toBe(720);
    expect(parseTimeInput("23:55")).toBe(1435);
    expect(parseTimeInput("25:00")).toBeNull();
  });

  it("labels dated and date-less schedule days", () => {
    expect(dayLabel(1, "2026-06-01")).toBe("Mon 6/1");
    expect(dayLabel(1, null)).toBe("Mon");
  });

  it("formats week ranges only for dated schedules", () => {
    expect(weekRangeLabel("2026-06-01", "2026-06-07")).toBe("Jun 1 - Jun 7");
    expect(weekRangeLabel(null, null)).toBe("Weekly template");
  });

  it("totals blocks and pins (pins count as their stored duration)", () => {
    const items: ScheduleItem[] = [
      {
        ...base,
        id: "a",
        kind: "block",
        title: "Focus",
        weekday: 1,
        startMinute: 540,
        endMinute: 660,
        categoryId: "work",
      },
      {
        ...base,
        id: "b",
        kind: "pin",
        title: "Start laundry",
        weekday: 1,
        startMinute: 720,
        endMinute: 722,
        categoryId: "rest",
      },
    ];
    expect(calculateWeeklyTotals(items, categories)).toEqual([
      { categoryId: "work", minutes: 120 },
      { categoryId: "rest", minutes: 2 },
    ]);
  });

  it("computes budget deltas only for target/minimum modes", () => {
    const items: ScheduleItem[] = [
      {
        ...base,
        id: "a",
        kind: "block",
        title: "Focus",
        weekday: 1,
        startMinute: 540,
        endMinute: 720,
        categoryId: "work",
      },
      {
        ...base,
        id: "b",
        kind: "pin",
        title: "Start laundry",
        weekday: 1,
        startMinute: 720,
        endMinute: 722,
        categoryId: "rest",
      },
    ];
    const totals = calculateWeeklyTotals(items, categories);
    expect(calculateCategoryBudgets(totals, categories)).toEqual([
      {
        categoryId: "work",
        parentId: null,
        mode: "target",
        targetMinutes: 600,
        actualMinutes: 180,
        rolledUpActualMinutes: 180,
        deltaMinutes: -420,
      },
      {
        categoryId: "rest",
        parentId: null,
        mode: "observation",
        targetMinutes: null,
        actualMinutes: 2,
        rolledUpActualMinutes: 2,
        deltaMinutes: null,
      },
    ]);
  });

  it("rolls a parent's actual up from its subcategories", () => {
    const hierCategories: Category[] = [
      {
        id: "family",
        name: "Family Time",
        color: "#7aa2f7",
        sortOrder: 1,
        archived: false,
        budgetMode: "target",
        targetMinutes: 1200,
        parentId: null,
      },
      {
        id: "meals",
        name: "Meals",
        color: "#9ece6a",
        sortOrder: 1,
        archived: false,
        budgetMode: "target",
        targetMinutes: 360,
        parentId: "family",
      },
    ];
    const items: ScheduleItem[] = [
      {
        ...base,
        id: "a",
        kind: "block",
        title: "Hang out",
        weekday: 1,
        startMinute: 600,
        endMinute: 720,
        categoryId: "family",
      },
      {
        ...base,
        id: "b",
        kind: "block",
        title: "Dinner",
        weekday: 1,
        startMinute: 1080,
        endMinute: 1140,
        categoryId: "meals",
      },
    ];
    const totals = calculateWeeklyTotals(items, hierCategories);
    const budgets = calculateCategoryBudgets(totals, hierCategories);
    const family = budgets.find((b) => b.categoryId === "family")!;
    const meals = budgets.find((b) => b.categoryId === "meals")!;
    // Parent: own 120 + child 60 = 180 rolled up; delta vs 1200 target.
    expect(family.actualMinutes).toBe(120);
    expect(family.rolledUpActualMinutes).toBe(180);
    expect(family.deltaMinutes).toBe(180 - 1200);
    // Child: own minutes only.
    expect(meals.actualMinutes).toBe(60);
    expect(meals.rolledUpActualMinutes).toBe(60);
    expect(meals.deltaMinutes).toBe(60 - 360);
  });

  it("orders categories parent-then-children and hides archived subtrees", () => {
    const cats: Category[] = [
      cat("p1", null, 1),
      cat("p1-c2", "p1", 2),
      cat("p1-c1", "p1", 1),
      cat("p2", null, 2, true),
      cat("p2-c1", "p2", 1),
    ];
    expect(orderedVisibleCategories(cats).map((c) => c.id)).toEqual([
      "p1",
      "p1-c1",
      "p1-c2",
    ]);
  });

  it("detects block overlaps on the same day", () => {
    const items: ScheduleItem[] = [
      {
        ...base,
        id: "a",
        kind: "block",
        title: "Focus",
        weekday: 1,
        startMinute: 540,
        endMinute: 660,
        categoryId: "work",
      },
      {
        ...base,
        id: "b",
        kind: "block",
        title: "Rest",
        weekday: 1,
        startMinute: 630,
        endMinute: 690,
        categoryId: "rest",
      },
    ];
    expect(findOverlaps(items)).toHaveLength(2);
  });
});

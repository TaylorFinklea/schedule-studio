import { describe, expect, it } from "vitest";
import {
  calculateCategoryBudgets,
  calculateWeeklyTotals,
  findOverlaps,
  formatDuration,
  formatTime,
  parseTimeInput,
  snapMinute,
} from "$lib/schedule";
import type { Category, ScheduleItem } from "$lib/types";

const categories: Category[] = [
  {
    id: "work",
    name: "Work",
    color: "#8b5cf6",
    sortOrder: 1,
    archived: false,
    budgetMode: "target",
    targetMinutes: 600,
  },
  {
    id: "rest",
    name: "Rest",
    color: "#fb7185",
    sortOrder: 2,
    archived: false,
    budgetMode: "observation",
    targetMinutes: null,
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
        mode: "target",
        targetMinutes: 600,
        actualMinutes: 180,
        deltaMinutes: -420,
      },
      {
        categoryId: "rest",
        mode: "observation",
        targetMinutes: null,
        actualMinutes: 2,
        deltaMinutes: null,
      },
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

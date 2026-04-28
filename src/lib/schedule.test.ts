import { describe, expect, it } from "vitest";
import {
  calculateWeeklyTotals,
  findOverlaps,
  formatDuration,
  formatTime,
  snapMinute,
} from "$lib/schedule";
import type { Category, ScheduleItem } from "$lib/types";

const categories: Category[] = [
  { id: "work", name: "Work", color: "#8b5cf6", sortOrder: 1, archived: false },
  { id: "rest", name: "Rest", color: "#fb7185", sortOrder: 2, archived: false },
];

const base = {
  templateId: "default",
  notes: "",
  completed: false,
  source: "template" as const,
};

describe("schedule helpers", () => {
  it("snaps to the nearest 15-minute increment", () => {
    expect(snapMinute(367)).toBe(360);
    expect(snapMinute(368)).toBe(375);
  });

  it("formats time and duration", () => {
    expect(formatTime(0)).toBe("12:00 AM");
    expect(formatTime(13 * 60 + 15)).toBe("1:15 PM");
    expect(formatDuration(135)).toBe("2h 15m");
  });

  it("totals timed blocks and ignores pins", () => {
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
        endMinute: null,
        categoryId: "rest",
      },
    ];
    expect(calculateWeeklyTotals(items, categories)).toEqual([
      { categoryId: "work", minutes: 120 },
      { categoryId: "rest", minutes: 0 },
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

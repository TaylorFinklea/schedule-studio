export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type ItemKind = "block" | "pin";

export type Category = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  archived: boolean;
};

export type DayBounds = {
  weekday: Weekday;
  wakeMinute: number;
  sleepMinute: number;
  bufferBefore: number;
  bufferAfter: number;
};

export type ScheduleItem = {
  id: string;
  templateId: string;
  kind: ItemKind;
  title: string;
  weekday: Weekday;
  startMinute: number;
  endMinute: number | null;
  categoryId: string;
  notes: string;
  completed: boolean;
  source: "template" | "override";
};

export type OverlapWarning = {
  itemId: string;
  otherItemId: string;
  otherTitle: string;
};

export type CategoryTotal = {
  categoryId: string;
  minutes: number;
};

export type DailyTotal = {
  weekday: Weekday;
  minutes: number;
};

export type WeekView = {
  templateId: string;
  templateName: string;
  weekStart: string;
  weekEnd: string;
  days: {
    weekday: Weekday;
    dateLabel: string;
    dayName: string;
    bounds: DayBounds;
    items: ScheduleItem[];
    totalMinutes: number;
  }[];
  categories: Category[];
  weeklyTotals: CategoryTotal[];
  dailyTotals: DailyTotal[];
  overlapWarnings: OverlapWarning[];
};

export type ItemInput = {
  id?: string;
  kind: ItemKind;
  title: string;
  weekday: Weekday;
  startMinute: number;
  endMinute?: number | null;
  categoryId: string;
  notes?: string;
  completed?: boolean;
};

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type ItemKind = "block" | "pin";
export type BudgetMode = "target" | "minimum" | "observation";

export const PIN_DEFAULT_MINUTES = 2;
export const PIN_MAX_MINUTES = 4;

export type Category = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  archived: boolean;
  budgetMode: BudgetMode;
  targetMinutes: number | null;
};

export type DayBounds = {
  weekday: Weekday;
  wakeMinute: number;
  sleepMinute: number;
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
  source: "template" | "override";
  seriesId: string | null;
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

export type CategoryBudget = {
  categoryId: string;
  mode: BudgetMode;
  targetMinutes: number | null;
  actualMinutes: number;
  deltaMinutes: number | null;
};

export type DailyTotal = {
  weekday: Weekday;
  minutes: number;
};

export type ScheduleVersion = {
  id: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  itemCount: number;
  totalMinutes: number;
  updatedAt: string;
};

export type Todo = {
  id: string;
  title: string;
  kind: ItemKind;
  categoryId: string | null;
  durationMinutes: number | null;
  sortOrder: number;
};

export type TodoInput = {
  id?: string;
  title: string;
  kind: ItemKind;
  categoryId?: string | null;
  durationMinutes?: number | null;
};

export type WeekView = {
  templateId: string;
  templateName: string;
  defaultTemplateId: string;
  weekStart: string;
  weekEnd: string;
  versions: ScheduleVersion[];
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
  categoryBudgets: CategoryBudget[];
  overlapWarnings: OverlapWarning[];
  todos: Todo[];
  categoryUsage: Record<string, number>;
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
  seriesId?: string | null;
  /** Multi-day create: the weekdays this item should land on. If 2+, the server creates a series. */
  weekdays?: Weekday[];
  /** Edit/delete scope when the item belongs to a series. */
  scope?: "instance" | "series";
};

export type CategoryUpdate = {
  id: string;
  name?: string;
  color?: string;
  budgetMode?: BudgetMode;
  targetMinutes?: number | null;
  archived?: boolean;
  sortOrder?: number;
};

export type CategoryCreateInput = {
  name: string;
  color: string;
  budgetMode?: BudgetMode;
  targetMinutes?: number | null;
};

export type VersionInput = {
  name: string;
  sourceTemplateId?: string;
};

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
  /** NULL for a top-level parent; otherwise the owning parent's id. */
  parentId: string | null;
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
  parentId: string | null;
  mode: BudgetMode;
  targetMinutes: number | null;
  /** Minutes from items assigned directly to this category. */
  actualMinutes: number;
  /** For a parent: own actual + sum of children's actuals. For a child: equals actualMinutes. */
  rolledUpActualMinutes: number;
  /** Compares target against the rolled-up actual; null in observation mode or without a target. */
  deltaMinutes: number | null;
};

export type DailyTotal = {
  weekday: Weekday;
  minutes: number;
};

export type ScheduleVersion = {
  id: string;
  name: string;
  weekStartDate: string | null;
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
  weekStart: string | null;
  weekEnd: string | null;
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
  parentId?: string | null;
};

export type CategoryCreateInput = {
  name: string;
  color: string;
  budgetMode?: BudgetMode;
  targetMinutes?: number | null;
  parentId?: string | null;
};

export type VersionInput = {
  name: string;
  sourceTemplateId?: string;
};

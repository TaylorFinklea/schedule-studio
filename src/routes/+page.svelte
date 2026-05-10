<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { onMount, untrack } from "svelte";
  import { X } from "lucide-svelte";
  import AppShell from "$lib/components/AppShell.svelte";
  import BudgetStrip from "$lib/components/BudgetStrip.svelte";
  import CategoryEditor from "$lib/components/CategoryEditor.svelte";
  import TodoSidebar from "$lib/components/TodoSidebar.svelte";
  import VersionMenu from "$lib/components/VersionMenu.svelte";
  import {
    formatDuration,
    formatTime,
    parseTimeInput,
    SNAP_MINUTES,
    snapMinute,
  } from "$lib/schedule";
  import { APP_THEMES, DEFAULT_THEME_ID, themeById } from "$lib/themes";
  import type {
    Category,
    ItemInput,
    ItemKind,
    OverlapWarning,
    ScheduleItem,
    Todo,
    WeekView,
    Weekday,
  } from "$lib/types";

  type PageData = { ingressPath: string; week: WeekView };

  let { data } = $props<{ data: PageData }>();

  const DEFAULT_HOUR_HEIGHT = 128;
  const MIN_HOUR_HEIGHT = 72;
  const MAX_HOUR_HEIGHT = 720;
  const ZOOM_STEP = 8;
  const PIN_HEIGHT = 28;
  const MIN_BLOCK_HEIGHT = 16;
  const DEFAULT_BLOCK_DURATION = 60;
  const HOVER_BLOCK_DURATION = 30;
  const HORIZONTAL_LABEL_WIDTH = 96;
  const HORIZONTAL_ROW_HEIGHT = 112;
  const ingressPath = $derived(data.ingressPath);

  function apiPath(path: string) {
    return `${ingressPath}${path}`;
  }

  // svelte-ignore state_referenced_locally -- local planner state is resynced from loader data below after mutations.
  let week = $state<WeekView>(data.week);
  let selectedId = $state<string | null>(null);
  let dialogOpen = $state(false);
  let editorMode = $state<"create" | "edit">("create");
  let editingId = $state<string | null>(null);
  let dialogKind = $state<"block" | "pin">("block");
  let draft = $state<ItemInput>(newDraft("block", 1, 9 * 60));
  let draftStartTime = $state(formatTime(9 * 60));
  let draftEndTime = $state(formatTime(10 * 60));
  let draftWeekdays = $state<Weekday[]>([1]);
  const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;

  function toggleDraftWeekday(weekday: Weekday) {
    if (draftWeekdays.includes(weekday)) {
      draftWeekdays = draftWeekdays.filter((w) => w !== weekday);
    } else {
      draftWeekdays = [...draftWeekdays, weekday].sort((a, b) => a - b);
    }
  }
  let editorError = $state("");
  let visibleDay = $state<Weekday>(4);
  let hourHeight = $state(DEFAULT_HOUR_HEIGHT);
  let layoutMode = $state<"vertical" | "horizontal">("horizontal");
  let settingsOpen = $state(false);
  let versionMenuOpen = $state(false);
  let editorAnchor = $state<{ x: number; y: number } | null>(null);
  let dayBoundsEditor = $state<{
    weekday: Weekday;
    anchor: { x: number; y: number };
    wakeText: string;
    sleepText: string;
    error: string;
  } | null>(null);
  let categoryDeleteError = $state("");
  let themeId = $state(DEFAULT_THEME_ID);
  let dragging = $state<{
    id: string;
    mode: "move" | "resize-start" | "resize-end";
    axis: "vertical" | "horizontal";
    originY: number;
    originStart: number;
    originEnd: number | null;
    originWeekday: Weekday;
  } | null>(null);
  let dragMoved = $state(false);
  let appToast = $state<string | null>(null);
  let appToastTimer: ReturnType<typeof setTimeout> | null = null;
  function showToast(message: string) {
    appToast = message;
    if (appToastTimer) clearTimeout(appToastTimer);
    appToastTimer = setTimeout(() => {
      appToast = null;
      appToastTimer = null;
    }, 2400);
  }
  let drawing = $state<{
    weekday: Weekday;
    axis: "vertical" | "horizontal";
    originX: number;
    originY: number;
    rectLeft: number;
    rectTop: number;
    rectWidth: number;
    rectHeight: number;
    startMinute: number;
    endMinute: number;
    moved: boolean;
  } | null>(null);

  $effect(() => {
    const incoming = data.week;
    untrack(() => {
      week = incoming;
      const incomingItems = incoming.days.flatMap(
        (day: WeekView["days"][number]) => day.items,
      );
      if (
        selectedId &&
        !incomingItems.some((item: ScheduleItem) => item.id === selectedId)
      )
        selectedId = null;
    });
  });

  onMount(() => {
    const stored = localStorage.getItem("schedule-studio-hour-height");
    if (stored !== null && Number.isFinite(Number(stored)))
      hourHeight = clampZoom(Number(stored));
    const storedLayout = localStorage.getItem("schedule-studio-layout");
    if (storedLayout === "vertical" || storedLayout === "horizontal")
      layoutMode = storedLayout;
    themeId = localStorage.getItem("schedule-studio-theme") ?? DEFAULT_THEME_ID;
    applyTheme(themeId);
  });

  $effect(() => {
    localStorage.setItem("schedule-studio-hour-height", String(hourHeight));
  });

  $effect(() => {
    localStorage.setItem("schedule-studio-layout", layoutMode);
  });

  $effect(() => {
    localStorage.setItem("schedule-studio-theme", themeId);
    applyTheme(themeId);
  });

  const selected = $derived(
    allItems().find((item: ScheduleItem) => item.id === selectedId) ?? null,
  );
  const selectedCategory = $derived(
    selected ? categoryById(selected.categoryId) : null,
  );
  const selectedWarnings = $derived(
    selected
      ? week.overlapWarnings.filter(
          (warning: OverlapWarning) => warning.itemId === selected.id,
        )
      : [],
  );
  const maxStart = $derived(
    Math.min(...week.days.map((day) => day.bounds.wakeMinute)),
  );
  const maxEnd = $derived(
    Math.max(...week.days.map((day) => day.bounds.sleepMinute)),
  );
  const totalGridMinutes = $derived(maxEnd - maxStart);
  const horizontalTimelineWidth = $derived(
    (totalGridMinutes / 60) * hourHeight,
  );
  const displayedDays = $derived(week.days);
  const categoryInUseIds = $derived(
    new Set(
      Object.entries(week.categoryUsage)
        .filter(([, count]) => count > 0)
        .map(([id]) => id),
    ),
  );

  function allItems(): ScheduleItem[] {
    return week.days.flatMap((day) => day.items);
  }

  function categoryById(id: string): Category {
    return (
      week.categories.find((category) => category.id === id) ??
      week.categories[0]
    );
  }

  function warningsFor(id: string): OverlapWarning[] {
    return week.overlapWarnings.filter(
      (warning: OverlapWarning) => warning.itemId === id,
    );
  }

  function newDraft(
    kind: "block" | "pin",
    weekday: Weekday,
    startMinute: number,
    duration = DEFAULT_BLOCK_DURATION,
  ): ItemInput {
    return {
      kind,
      title: kind === "pin" ? "Start laundry" : "Deep work",
      weekday,
      startMinute,
      endMinute:
        kind === "pin" ? null : Math.min(24 * 60, startMinute + duration),
      categoryId: week?.categories?.[0]?.id ?? "deep-work",
      notes: "",
      seriesId: null,
    };
  }

  function siblingWeekdaysFor(item: ScheduleItem): Weekday[] {
    if (!item.seriesId) return [item.weekday];
    const found = new Set<Weekday>();
    for (const day of week.days) {
      for (const it of day.items) {
        if (it.seriesId === item.seriesId) found.add(it.weekday);
      }
    }
    if (found.size === 0) found.add(item.weekday);
    return Array.from(found).sort((a, b) => a - b) as Weekday[];
  }

  function openCreate(
    kind: "block" | "pin",
    weekday: Weekday = visibleDay,
    startMinute = 9 * 60,
    duration = DEFAULT_BLOCK_DURATION,
  ) {
    editorMode = "create";
    editingId = null;
    dialogKind = kind;
    draft = newDraft(kind, weekday, startMinute, duration);
    draftStartTime = formatTime(draft.startMinute);
    draftEndTime = formatTime(draft.endMinute ?? draft.startMinute + duration);
    draftWeekdays = [weekday];
    editorError = "";
    dialogOpen = true;
  }

  function openEdit(item: ScheduleItem, event?: MouseEvent | PointerEvent) {
    if (dragMoved) {
      // Suppress the click that fires at the end of a drag.
      dragMoved = false;
      return;
    }
    editorMode = "edit";
    editingId = item.id;
    dialogKind = item.kind;
    draft = {
      id: item.id,
      kind: item.kind,
      title: item.title,
      weekday: item.weekday,
      startMinute: item.startMinute,
      endMinute: item.endMinute,
      categoryId: item.categoryId,
      notes: item.notes,
      seriesId: item.seriesId,
    };
    draftWeekdays = siblingWeekdaysFor(item);
    draftStartTime = formatTime(item.startMinute);
    draftEndTime = formatTime(item.endMinute ?? item.startMinute);
    editorError = "";
    selectedId = item.id;
    if (event?.currentTarget instanceof HTMLElement) {
      const rect = event.currentTarget.getBoundingClientRect();
      editorAnchor = { x: rect.left + rect.width / 2, y: rect.bottom };
    } else if (event && "clientX" in event) {
      editorAnchor = { x: event.clientX, y: event.clientY };
    }
    dialogOpen = true;
  }

  function draftForSave() {
    const startMinute = parseTimeInput(draftStartTime);
    const endMinute =
      dialogKind === "block" ? parseTimeInput(draftEndTime) : null;
    if (startMinute === null) {
      editorError = "Use a start time like 4:25 AM.";
      return null;
    }
    if (dialogKind === "block" && endMinute === null) {
      editorError = "Use an end time like 5:15 AM.";
      return null;
    }
    if (
      dialogKind === "block" &&
      endMinute !== null &&
      endMinute <= startMinute
    ) {
      editorError = "End time must be after start time.";
      return null;
    }
    if (draftWeekdays.length === 0) {
      editorError = "Pick at least one day.";
      return null;
    }
    editorError = "";
    const sortedWeekdays = [...draftWeekdays].sort(
      (a, b) => a - b,
    ) as Weekday[];
    const anchorWeekday: Weekday = sortedWeekdays.includes(draft.weekday)
      ? draft.weekday
      : sortedWeekdays[0];
    return {
      ...draft,
      kind: dialogKind,
      startMinute,
      endMinute: dialogKind === "pin" ? null : endMinute,
      weekday: anchorWeekday,
      weekdays: sortedWeekdays,
    };
  }

  async function saveItem() {
    const payload = draftForSave();
    if (!payload) return;
    let url: string;
    let method: "POST" | "PUT";
    let body: unknown = payload;
    if (editorMode === "edit" && editingId) {
      url = apiPath(`/api/items/${editingId}`);
      method = "PUT";
      const promoting = !payload.seriesId && payload.weekdays.length > 1;
      const stayingInSeries = !!payload.seriesId;
      if (promoting || stayingInSeries) {
        body = {
          ...payload,
          scope: "series",
          seriesId: payload.seriesId ?? crypto.randomUUID(),
        };
      } else {
        body = { ...payload, scope: "instance" };
      }
    } else {
      url = apiPath("/api/items");
      method = "POST";
    }
    const result = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((response) => response.json());
    dialogOpen = false;
    const firstId = Array.isArray(result) ? result[0]?.id : result?.id;
    selectedId = firstId ?? selectedId;
    if (Array.isArray(result) && result.length > 1) {
      showToast(`Updated ${result.length} instances`);
    } else if (Array.isArray(result) && result.length === 1) {
      showToast("Created");
    }
    await invalidateAll();
  }

  async function detachFromSeries() {
    if (!editingId || !draft.seriesId) return;
    const payload = draftForSave();
    if (!payload) return;
    const result = await fetch(apiPath(`/api/items/${editingId}`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        scope: "instance",
        weekdays: [payload.weekday],
      }),
    }).then((response) => response.json());
    draft = { ...draft, seriesId: null };
    draftWeekdays = [draft.weekday];
    selectedId = result?.id ?? selectedId;
    showToast("Detached from series");
    await invalidateAll();
  }

  async function deleteEditingItem() {
    if (!editingId) return;
    await fetch(apiPath(`/api/items/${editingId}`), { method: "DELETE" });
    dialogOpen = false;
    selectedId = null;
    showToast("Deleted");
    await invalidateAll();
  }

  async function deleteEditingSeries() {
    if (!editingId || !draft.seriesId) return;
    const params = new URLSearchParams({
      scope: "series",
      seriesId: draft.seriesId,
    });
    await fetch(apiPath(`/api/items/${editingId}?${params.toString()}`), {
      method: "DELETE",
    });
    dialogOpen = false;
    selectedId = null;
    showToast("Series deleted");
    await invalidateAll();
  }

  async function persistItem(
    item: ScheduleItem,
    opts: { weekdayChanged?: boolean } = {},
  ) {
    let body: unknown = item;
    if (item.seriesId) {
      if (opts.weekdayChanged) {
        // Cross-day drag detaches just this instance — moving to a new day
        // shouldn't drag every sibling along with it.
        body = { ...item, scope: "instance", weekdays: [item.weekday] };
      } else {
        // Same-day resize / move propagates to every sibling so the series
        // stays in sync (matches the editor's default behavior).
        body = {
          ...item,
          scope: "series",
          weekdays: siblingWeekdaysFor(item),
        };
      }
    }
    await fetch(apiPath(`/api/items/${item.id}`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    await invalidateAll();
  }

  async function deleteSelected() {
    if (!selected) return;
    await fetch(apiPath(`/api/items/${selected.id}`), { method: "DELETE" });
    selectedId = null;
    await invalidateAll();
  }

  async function duplicateSelected() {
    if (!selected) return;
    const copy = {
      ...selected,
      id: undefined,
      title: `${selected.title} copy`,
      startMinute: snapMinute(selected.startMinute + 30),
      endMinute: selected.endMinute
        ? snapMinute(selected.endMinute + 30)
        : null,
    };
    await fetch(apiPath("/api/items"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(copy),
    });
    await invalidateAll();
  }

  async function createSandboxVersion(name: string) {
    await fetch(apiPath("/api/versions"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, sourceTemplateId: week.templateId }),
    });
    selectedId = null;
    versionMenuOpen = false;
    await invalidateAll();
  }

  async function activateVersion(id: string) {
    await fetch(apiPath(`/api/versions/${id}`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "activate" }),
    });
    selectedId = null;
    await invalidateAll();
  }

  async function renameVersion(id: string, name: string) {
    if (!name) return;
    await fetch(apiPath(`/api/versions/${id}`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await invalidateAll();
  }

  async function deleteVersion(id: string) {
    if (id === week.defaultTemplateId) return;
    await fetch(apiPath(`/api/versions/${id}`), { method: "DELETE" });
    selectedId = null;
    versionMenuOpen = false;
    await invalidateAll();
  }

  async function updateCategorySettings(
    id: string,
    patch: {
      name?: string;
      color?: string;
      budgetMode?: "target" | "minimum" | "observation";
      targetMinutes?: number | null;
      archived?: boolean;
      sortOrder?: number;
    },
  ) {
    await fetch(apiPath(`/api/categories/${id}`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    await invalidateAll();
  }

  async function createCategoryRequest(payload: {
    name: string;
    color: string;
  }) {
    await fetch(apiPath("/api/categories"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    await invalidateAll();
  }

  async function deleteCategoryRequest(id: string) {
    const response = await fetch(apiPath(`/api/categories/${id}`), {
      method: "DELETE",
    });
    if (response.status === 409) {
      categoryDeleteError = "That category is still used by schedule items.";
    } else {
      categoryDeleteError = "";
    }
    await invalidateAll();
  }

  async function reorderCategoryRequest(id: string, direction: "up" | "down") {
    await fetch(apiPath("/api/categories/reorder"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, direction }),
    });
    await invalidateAll();
  }

  const TODO_DRAG_MIME = "application/x-schedule-studio-todo";

  async function createTodoRequest(payload: {
    title: string;
    kind: ItemKind;
    categoryId: string | null;
    durationMinutes: number | null;
  }) {
    await fetch(apiPath("/api/todos"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    await invalidateAll();
  }

  async function updateTodoRequest(
    id: string,
    patch: Partial<{
      title: string;
      kind: ItemKind;
      categoryId: string | null;
      durationMinutes: number | null;
    }>,
  ) {
    await fetch(apiPath(`/api/todos/${id}`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    await invalidateAll();
  }

  async function deleteTodoRequest(id: string) {
    await fetch(apiPath(`/api/todos/${id}`), { method: "DELETE" });
    await invalidateAll();
  }

  function handleTodoDragStart(todo: Todo, event: DragEvent) {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(
      TODO_DRAG_MIME,
      JSON.stringify({
        title: todo.title,
        kind: todo.kind,
        categoryId: todo.categoryId,
        durationMinutes: todo.durationMinutes,
      }),
    );
    // Plain-text fallback so browsers that ignore custom MIME types still
    // know something is being dragged (mostly cosmetic for the drag image).
    event.dataTransfer.setData("text/plain", todo.title);
  }

  function readTodoDragPayload(event: DragEvent) {
    const raw =
      event.dataTransfer?.getData(TODO_DRAG_MIME) ??
      event.dataTransfer?.getData("text/plain") ??
      "";
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed?.title === "string" &&
        (parsed.kind === "block" || parsed.kind === "pin")
      ) {
        return parsed as {
          title: string;
          kind: ItemKind;
          categoryId: string | null;
          durationMinutes: number | null;
        };
      }
    } catch {
      // Plain-text fallback: title only, default block + 60min.
      return {
        title: raw,
        kind: "block" as const,
        categoryId: null,
        durationMinutes: null,
      };
    }
    return null;
  }

  function handleDayDragOver(event: DragEvent) {
    if (!event.dataTransfer?.types.includes(TODO_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  async function handleDayDrop(
    event: DragEvent,
    weekday: Weekday,
    axis: "vertical" | "horizontal",
  ) {
    const payload = readTodoDragPayload(event);
    if (!payload) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const offset =
      axis === "horizontal"
        ? Math.max(0, Math.min(rect.width, event.clientX - rect.left))
        : Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const startMinute = Math.max(
      maxStart,
      Math.min(maxEnd - SNAP_MINUTES, minuteFromOffset(offset)),
    );
    const duration =
      payload.kind === "block"
        ? (payload.durationMinutes ?? DEFAULT_BLOCK_DURATION)
        : null;
    const fallbackCategoryId = week.categories[0]?.id ?? "deep-work";
    const item: ItemInput = {
      kind: payload.kind,
      title: payload.title,
      weekday,
      startMinute,
      endMinute: payload.kind === "pin" ? null : startMinute + (duration ?? 60),
      categoryId: payload.categoryId ?? fallbackCategoryId,
      notes: "",
      seriesId: null,
    };
    await fetch(apiPath("/api/items"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(item),
    });
    showToast(`Added "${payload.title}"`);
    await invalidateAll();
  }

  function itemStyle(item: ScheduleItem) {
    const top = ((item.startMinute - maxStart) / totalGridMinutes) * 100;
    const height = item.kind === "pin" ? PIN_HEIGHT : blockHeight(item);
    return `top:${top}%;height:${item.kind === "pin" ? `${PIN_HEIGHT}px` : `${height}px`};`;
  }

  function blockHeight(item: ScheduleItem) {
    return Math.max(
      MIN_BLOCK_HEIGHT,
      (((item.endMinute ?? item.startMinute + SNAP_MINUTES) -
        item.startMinute) /
        60) *
        hourHeight,
    );
  }

  function clampZoom(value: number) {
    return Math.min(
      MAX_HOUR_HEIGHT,
      Math.max(MIN_HOUR_HEIGHT, Math.round(value / ZOOM_STEP) * ZOOM_STEP),
    );
  }

  function setZoom(value: number) {
    hourHeight = clampZoom(value);
  }

  function setLayoutMode(mode: "vertical" | "horizontal") {
    layoutMode = mode;
    localStorage.setItem("schedule-studio-layout", mode);
  }

  function openSettings() {
    settingsOpen = !settingsOpen;
    dialogOpen = false;
  }

  function openDayBoundsEditor(
    weekday: Weekday,
    event: MouseEvent | PointerEvent,
  ) {
    const day = week.days.find((d) => d.weekday === weekday);
    if (!day) return;
    visibleDay = weekday;
    dayBoundsEditor = {
      weekday,
      anchor: { x: event.clientX, y: event.clientY },
      wakeText: formatTime(day.bounds.wakeMinute),
      sleepText: formatTime(day.bounds.sleepMinute),
      error: "",
    };
  }

  async function saveDayBounds() {
    if (!dayBoundsEditor) return;
    const wake = parseTimeInput(dayBoundsEditor.wakeText);
    const sleep = parseTimeInput(dayBoundsEditor.sleepText);
    if (wake === null) {
      dayBoundsEditor.error = "Use a wake time like 5:30 AM.";
      return;
    }
    if (sleep === null) {
      dayBoundsEditor.error = "Use a sleep time like 10:00 PM.";
      return;
    }
    if (sleep <= wake) {
      dayBoundsEditor.error = "Sleep must be after wake.";
      return;
    }
    await fetch(apiPath(`/api/day-bounds/${dayBoundsEditor.weekday}`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wakeMinute: wake, sleepMinute: sleep }),
    });
    dayBoundsEditor = null;
    await invalidateAll();
  }

  function zoomPercent() {
    return Math.round((hourHeight / DEFAULT_HOUR_HEIGHT) * 100);
  }

  function itemDuration(item: ScheduleItem) {
    return (item.endMinute ?? item.startMinute) - item.startMinute;
  }

  function itemDensity(item: ScheduleItem) {
    if (item.kind === "pin") return "pin";
    const height = blockHeight(item);
    if (height < 28) return "micro";
    if (height < 48) return "compact";
    return "normal";
  }

  function hourTicks() {
    const ticks: number[] = [];
    for (
      let minute = Math.ceil(maxStart / 60) * 60;
      minute <= maxEnd;
      minute += 60
    )
      ticks.push(minute);
    return ticks;
  }

  function tickStyle(minute: number) {
    return `top:${((minute - maxStart) / totalGridMinutes) * 100}%`;
  }

  function boundsStyle(startMinute: number, endMinute: number) {
    return `top:${((startMinute - maxStart) / totalGridMinutes) * 100}%;height:${((endMinute - startMinute) / totalGridMinutes) * 100}%`;
  }

  function minuteFromOffset(offset: number): number {
    const rawMinute = maxStart + (offset / hourHeight) * 60;
    return Math.max(maxStart, Math.min(maxEnd, snapMinute(rawMinute)));
  }

  function beginDraw(
    event: PointerEvent,
    weekday: Weekday,
    axis: "vertical" | "horizontal" = "vertical",
  ) {
    if (
      dialogOpen ||
      dragging ||
      drawing ||
      (event.target instanceof Element &&
        event.target.closest("[data-schedule-item]"))
    ) {
      return;
    }
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const rect = target.getBoundingClientRect();
    const offset =
      axis === "horizontal"
        ? Math.max(0, Math.min(rect.width, event.clientX - rect.left))
        : Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const startMinute = Math.max(
      maxStart,
      Math.min(maxEnd - SNAP_MINUTES, minuteFromOffset(offset)),
    );
    drawing = {
      weekday,
      axis,
      originX: event.clientX,
      originY: event.clientY,
      rectLeft: rect.left,
      rectTop: rect.top,
      rectWidth: rect.width,
      rectHeight: rect.height,
      startMinute,
      endMinute: Math.min(maxEnd, startMinute + DEFAULT_BLOCK_DURATION),
      moved: false,
    };
  }

  function moveDraw(event: PointerEvent) {
    if (!drawing) return;
    const dx = event.clientX - drawing.originX;
    const dy = event.clientY - drawing.originY;
    const primary = drawing.axis === "horizontal" ? dx : dy;
    if (Math.abs(primary) > 3) drawing.moved = true;
    const offset =
      drawing.axis === "horizontal"
        ? Math.max(
            0,
            Math.min(drawing.rectWidth, event.clientX - drawing.rectLeft),
          )
        : Math.max(
            0,
            Math.min(drawing.rectHeight, event.clientY - drawing.rectTop),
          );
    const candidate = minuteFromOffset(offset);
    // Anchor is wherever the pointerdown landed; the user's drag direction
    // sets which side of the anchor becomes start vs end.
    const anchor = minuteFromOffset(
      drawing.axis === "horizontal"
        ? Math.max(
            0,
            Math.min(drawing.rectWidth, drawing.originX - drawing.rectLeft),
          )
        : Math.max(
            0,
            Math.min(drawing.rectHeight, drawing.originY - drawing.rectTop),
          ),
    );
    if (candidate >= anchor) {
      drawing.startMinute = anchor;
      drawing.endMinute = Math.max(anchor + SNAP_MINUTES, candidate);
    } else {
      drawing.startMinute = Math.min(candidate, anchor - SNAP_MINUTES);
      drawing.endMinute = anchor;
    }
  }

  function endDraw(event: PointerEvent) {
    if (!drawing) return;
    const target = event.currentTarget as HTMLElement;
    try {
      target.releasePointerCapture(event.pointerId);
    } catch {
      /* capture already released */
    }
    const { weekday, startMinute, endMinute, moved } = drawing;
    drawing = null;
    editorAnchor = { x: event.clientX, y: event.clientY };
    const duration = moved
      ? Math.max(SNAP_MINUTES, endMinute - startMinute)
      : DEFAULT_BLOCK_DURATION;
    openCreate("block", weekday, startMinute, duration);
  }

  function cancelDraw() {
    drawing = null;
  }

  function drawingGhostStyleVertical(d: {
    startMinute: number;
    endMinute: number;
  }): string {
    const top = ((d.startMinute - maxStart) / totalGridMinutes) * 100;
    const height = ((d.endMinute - d.startMinute) / totalGridMinutes) * 100;
    return `top:${top}%;height:${height}%;left:12px;right:12px;`;
  }

  function drawingGhostStyleHorizontal(d: {
    startMinute: number;
    endMinute: number;
  }): string {
    const left = ((d.startMinute - maxStart) / 60) * hourHeight;
    const width = Math.max(
      2,
      ((d.endMinute - d.startMinute) / 60) * hourHeight,
    );
    return `left:${left}px;width:${width}px;top:32px;bottom:8px;`;
  }

  function beginDrag(
    event: PointerEvent,
    item: ScheduleItem,
    mode: "move" | "resize-start" | "resize-end",
    axis: "vertical" | "horizontal" = "vertical",
  ) {
    if (item.kind === "pin" && mode !== "move") return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging = {
      id: item.id,
      mode,
      axis,
      originY: axis === "horizontal" ? event.clientX : event.clientY,
      originStart: item.startMinute,
      originEnd: item.endMinute,
      originWeekday: item.weekday,
    };
    dragMoved = false;
    selectedId = item.id;
  }

  async function moveDrag(event: PointerEvent) {
    if (!dragging) return;
    const item = allItems().find(
      (candidate: ScheduleItem) => candidate.id === dragging?.id,
    );
    if (!item) return;
    const pointer =
      dragging.axis === "horizontal" ? event.clientX : event.clientY;
    if (Math.abs(pointer - dragging.originY) > 3) dragMoved = true;
    // Delta is the raw minute-difference from the drag origin. We don't snap
    // it here — `snapMinute` clamps to [0, 1440] which would zero out any
    // negative delta and prevent shrinking. Downstream calls snap the
    // resulting absolute time, which already rounds to the 5-minute grid.
    const deltaMinutes = ((pointer - dragging.originY) / hourHeight) * 60;
    let startMinute = dragging.originStart;
    let endMinute = dragging.originEnd;

    if (dragging.mode === "move") {
      startMinute = snapMinute(dragging.originStart + deltaMinutes);
      endMinute =
        dragging.originEnd === null
          ? null
          : snapMinute(dragging.originEnd + deltaMinutes);
      const targetWeekday = detectWeekdayUnderPointer(
        event.clientX,
        event.clientY,
        dragging.axis,
      );
      if (targetWeekday && targetWeekday !== item.weekday) {
        updateLocalItem(item.id, {
          startMinute,
          endMinute,
          weekday: targetWeekday,
        });
        return;
      }
    } else if (dragging.mode === "resize-start") {
      startMinute = Math.min(
        snapMinute(dragging.originStart + deltaMinutes),
        (dragging.originEnd ?? dragging.originStart + SNAP_MINUTES) -
          SNAP_MINUTES,
      );
    } else if (dragging.mode === "resize-end") {
      endMinute = Math.max(
        snapMinute(
          (dragging.originEnd ?? dragging.originStart + 60) + deltaMinutes,
        ),
        dragging.originStart + SNAP_MINUTES,
      );
    }

    updateLocalItem(item.id, { startMinute, endMinute });
  }

  async function endDrag() {
    if (!dragging) return;
    const originWeekday = dragging.originWeekday;
    const item = allItems().find(
      (candidate: ScheduleItem) => candidate.id === dragging?.id,
    );
    dragging = null;
    if (!item) return;
    await persistItem(item, {
      weekdayChanged: item.weekday !== originWeekday,
    });
  }

  function detectWeekdayUnderPointer(
    clientX: number,
    clientY: number,
    axis: "vertical" | "horizontal",
  ): Weekday | null {
    const selector =
      axis === "horizontal"
        ? '[data-testid^="horizontal-day-"]'
        : '[data-testid^="day-column-"]';
    const cells = document.querySelectorAll<HTMLElement>(selector);
    for (const cell of cells) {
      const r = cell.getBoundingClientRect();
      if (axis === "horizontal") {
        if (clientY >= r.top && clientY < r.bottom) {
          return weekdayFromTestId(cell.getAttribute("data-testid"));
        }
      } else {
        if (clientX >= r.left && clientX < r.right) {
          return weekdayFromTestId(cell.getAttribute("data-testid"));
        }
      }
    }
    return null;
  }

  function weekdayFromTestId(testid: string | null): Weekday | null {
    const match = testid?.match(/-(\d+)$/);
    if (!match) return null;
    const n = parseInt(match[1], 10);
    return n >= 1 && n <= 7 ? (n as Weekday) : null;
  }

  function updateLocalItem(id: string, patch: Partial<ScheduleItem>) {
    if (patch.weekday !== undefined) {
      // Re-bucket the item into its (possibly new) day.
      let updated: ScheduleItem | null = null;
      const stripped = week.days.map((day) => ({
        ...day,
        items: day.items.filter((item: ScheduleItem) => {
          if (item.id !== id) return true;
          updated = { ...item, ...patch };
          return false;
        }),
      }));
      if (!updated) return;
      const moved = updated as ScheduleItem;
      week = {
        ...week,
        days: stripped.map((day) =>
          day.weekday === moved.weekday
            ? { ...day, items: [...day.items, moved] }
            : day,
        ),
      };
      return;
    }
    week = {
      ...week,
      days: week.days.map((day) => ({
        ...day,
        items: day.items.map((item: ScheduleItem) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      })),
    };
  }

  function applyTheme(id: string) {
    if (typeof document === "undefined") return;
    const theme = themeById(id);
    document.documentElement.dataset.theme = theme.id;
    document.documentElement.dataset.themeMode = theme.mode;
    for (const [name, value] of Object.entries(theme.tokens)) {
      document.documentElement.style.setProperty(name, value);
    }
  }

  function horizontalItemStyle(item: ScheduleItem) {
    const left = ((item.startMinute - maxStart) / 60) * hourHeight;
    if (item.kind === "pin") {
      return `left:${left}px;width:148px;`;
    }
    const width = Math.max(
      MIN_BLOCK_HEIGHT * 2,
      (((item.endMinute ?? item.startMinute + SNAP_MINUTES) -
        item.startMinute) /
        60) *
        hourHeight,
    );
    return `left:${left}px;width:${width}px;`;
  }

  function horizontalHoverStyle(minute: number) {
    return `left:${((minute - maxStart) / 60) * hourHeight}px;`;
  }

  function dateRangeLabel() {
    const start = new Date(`${week.weekStart}T00:00:00`);
    const end = new Date(`${week.weekEnd}T00:00:00`);
    return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }
</script>

<div
  class="bg-background text-foreground flex h-screen flex-col overflow-hidden"
>
  <AppShell
    versionLabel={week.templateName}
    weekRangeLabel={dateRangeLabel()}
    {layoutMode}
    {hourHeight}
    defaultZoom={DEFAULT_HOUR_HEIGHT}
    zoomStep={ZOOM_STEP}
    onLayoutChange={setLayoutMode}
    onZoomChange={setZoom}
    onAdd={() => openCreate("block")}
    onMenu={openSettings}
    onVersionMenu={() => (versionMenuOpen = !versionMenuOpen)}
  />
  <BudgetStrip categories={week.categories} budgets={week.categoryBudgets} />
  {#if appToast}
    <div
      class="border-border bg-surface text-foreground/90 pointer-events-none fixed top-16 left-1/2 z-50 -translate-x-1/2 rounded-md border px-3 py-1.5 text-[12px] shadow-lg shadow-black/40"
      data-testid="app-toast"
      role="status"
      aria-live="polite"
    >
      {appToast}
    </div>
  {/if}

  <main class="flex min-h-0 flex-1">
    <section class="flex min-w-0 flex-1 flex-col">
      {#if layoutMode === "vertical"}
        <div
          class="border-border bg-surface-2/70 grid h-10 shrink-0 border-b"
          style="grid-template-columns: 80px repeat({displayedDays.length}, minmax(150px, 1fr));"
        >
          <div class="text-muted-foreground flex items-center px-4 text-[12px]">
            All times
          </div>
          {#each displayedDays as day}
            <button
              class="border-border hover:bg-muted/30 border-l px-3 text-left transition-colors {day.weekday ===
              visibleDay
                ? 'text-[#bb9af7]'
                : ''}"
              data-testid={`day-header-${day.weekday}`}
              on:click={(event) => openDayBoundsEditor(day.weekday, event)}
            >
              <div class="text-[14px] font-semibold">{day.dateLabel}</div>
              <div class="text-muted-foreground mt-0.5 flex gap-4 text-[10px]">
                <span
                  >Wake {formatTime(day.bounds.wakeMinute).replace(
                    ":00 ",
                    " ",
                  )}</span
                >
                <span
                  >Sleep {formatTime(day.bounds.sleepMinute).replace(
                    ":00 ",
                    " ",
                  )}</span
                >
              </div>
            </button>
          {/each}
        </div>
      {/if}

      <div class="relative min-h-0 flex-1 overflow-auto">
        {#if layoutMode === "vertical"}
          <div
            class="relative grid min-h-[980px]"
            style="grid-template-columns: 80px repeat({displayedDays.length}, minmax(150px, 1fr)); height: {(totalGridMinutes /
              60) *
              hourHeight}px;"
          >
            <div class="border-border bg-surface/70 relative border-r">
              {#each hourTicks() as tick}
                <div
                  class="text-muted-foreground absolute right-0 left-0 -translate-y-2 px-4 text-[12px]"
                  style={tickStyle(tick)}
                >
                  {formatTime(tick).replace(":00", "")}
                </div>
              {/each}
            </div>

            {#each displayedDays as day}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                class="border-border/80 relative cursor-cell border-r bg-[var(--timeline)]"
                data-testid={`day-column-${day.weekday}`}
                on:pointerdown={(event) =>
                  beginDraw(event, day.weekday, "vertical")}
                on:pointermove={moveDraw}
                on:pointerup={endDraw}
                on:pointercancel={cancelDraw}
                on:dragover={handleDayDragOver}
                on:drop={(event) =>
                  handleDayDrop(event, day.weekday, "vertical")}
              >
                {#each hourTicks() as tick}
                  <div
                    class="absolute right-0 left-0 border-t border-dashed border-white/[0.055]"
                    style={tickStyle(tick)}
                  ></div>
                {/each}
                {#if drawing && drawing.weekday === day.weekday && drawing.axis === "vertical"}
                  <div
                    class="pointer-events-none absolute z-20 rounded-md border-2 border-dashed border-[#7aa2f7] bg-[#7aa2f7]/10"
                    style={drawingGhostStyleVertical(drawing)}
                    aria-hidden="true"
                  ></div>
                {/if}

                {#each day.items as item}
                  {@const category = categoryById(item.categoryId)}
                  {@const itemWarnings = warningsFor(item.id)}
                  {@const density = itemDensity(item)}
                  <button
                    data-schedule-item
                    data-testid="schedule-item"
                    data-series-id={item.seriesId ?? ""}
                    class="focus:ring-ring absolute right-3 left-3 z-10 overflow-hidden rounded-md border text-left shadow-lg shadow-black/20 transition-transform hover:translate-y-[-1px] focus:ring-2 focus:outline-none {selectedId ===
                    item.id
                      ? 'ring-2 ring-[#7aa2f7]/80'
                      : ''} {density === 'pin'
                      ? 'flex items-center gap-2 bg-transparent px-2 !shadow-none'
                      : ''} {density === 'micro'
                      ? 'px-2 py-0.5'
                      : ''} {density === 'compact'
                      ? 'px-2 py-1'
                      : ''} {density === 'normal' ? 'px-3 py-2' : ''}"
                    style="{itemStyle(
                      item,
                    )} border-color: {category.color}; background: {item.kind ===
                    'pin'
                      ? 'transparent'
                      : `linear-gradient(135deg, ${category.color}42, ${category.color}1a)`};"
                    on:click={(event) => openEdit(item, event)}
                    on:dblclick={(event) => openEdit(item, event)}
                    on:pointermove={moveDrag}
                    on:pointerup={endDrag}
                    on:pointercancel={endDrag}
                  >
                    {#if item.seriesId}
                      <span
                        data-testid="series-marker"
                        class="pointer-events-none absolute top-1 right-1 z-30 h-1.5 w-1.5 rounded-full"
                        style="background:{category.color};"
                        aria-label="Part of a series"
                      ></span>
                    {/if}
                    {#if item.kind === "block"}
                      <!-- Always-active resize hit zones at the top and bottom edges. -->
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <span
                        data-testid="resize-start-handle"
                        class="absolute top-0 right-0 left-0 z-30 h-1.5 cursor-ns-resize"
                        on:pointerdown={(event) =>
                          beginDrag(event, item, "resize-start")}
                      ></span>
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <span
                        data-testid="resize-end-handle"
                        class="absolute right-0 bottom-0 left-0 z-30 h-1.5 cursor-ns-resize"
                        on:pointerdown={(event) =>
                          beginDrag(event, item, "resize-end")}
                      ></span>
                      <!-- Move zone covers the middle. -->
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <span
                        class="absolute top-1.5 right-0 bottom-1.5 left-0 z-10 cursor-grab"
                        on:pointerdown={(event) =>
                          beginDrag(event, item, "move")}
                      ></span>
                      {#if selectedId === item.id}
                        <!-- Visual accent on selection. -->
                        <span
                          class="pointer-events-none absolute top-0 left-1/2 z-20 h-2 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60 bg-white/80"
                        ></span>
                        <span
                          class="pointer-events-none absolute bottom-0 left-1/2 z-20 h-2 w-10 -translate-x-1/2 translate-y-1/2 rounded-full border border-white/60 bg-white/80"
                        ></span>
                      {/if}
                      {#if density === "micro"}
                        <span
                          class="pointer-events-none relative block truncate text-[11px] leading-[16px] font-semibold"
                          title={`${item.title}: ${formatTime(item.startMinute)} - ${formatTime(item.endMinute ?? item.startMinute)}`}
                        >
                          {item.title}
                        </span>
                      {:else if density === "compact"}
                        <span
                          class="pointer-events-none relative block truncate text-[11px] leading-[18px] font-semibold"
                          title={`${item.title}: ${formatTime(item.startMinute)} - ${formatTime(item.endMinute ?? item.startMinute)}`}
                        >
                          {item.title}
                          <span class="text-foreground/65 font-normal">
                            · {formatTime(item.startMinute)
                              .replace(" AM", "")
                              .replace(" PM", "")} - {formatTime(
                              item.endMinute ?? item.startMinute,
                            )
                              .replace(" AM", "")
                              .replace(" PM", "")}
                          </span>
                        </span>
                      {:else}
                        <span
                          class="pointer-events-none relative block truncate text-[12px] leading-[17px] font-semibold"
                          >{item.title}</span
                        >
                        <span
                          class="text-foreground/70 pointer-events-none relative mt-0.5 block truncate text-[11px] leading-[14px]"
                        >
                          {formatTime(item.startMinute)
                            .replace(" AM", "")
                            .replace(" PM", "")} - {formatTime(
                            item.endMinute ?? item.startMinute,
                          )
                            .replace(" AM", "")
                            .replace(" PM", "")}
                        </span>
                      {/if}
                      {#if itemWarnings.length}
                        <span
                          class="pointer-events-none relative mt-1 inline-flex rounded bg-red-500/80 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                          >Overlap</span
                        >
                      {/if}
                    {:else}
                      <span
                        class="h-2.5 w-2.5 shrink-0 rounded-full"
                        style="background:{category.color}"
                      ></span>
                      <span class="text-foreground/75 truncate text-[11px]"
                        >{item.title}</span
                      >
                    {/if}
                  </button>
                {/each}
              </div>
            {/each}
          </div>
        {:else}
          <div
            class="relative min-h-full"
            style="width:{HORIZONTAL_LABEL_WIDTH +
              horizontalTimelineWidth}px; min-width: 100%;"
          >
            <div
              class="border-border bg-surface/80 sticky top-0 z-30 h-11 border-b"
            >
              <div
                class="text-muted-foreground absolute top-0 bottom-0 left-0 flex items-center px-4 text-[12px]"
                style="width:{HORIZONTAL_LABEL_WIDTH}px;"
              >
                All times
              </div>
              <div
                class="absolute top-0 bottom-0"
                style="left:{HORIZONTAL_LABEL_WIDTH}px;width:{horizontalTimelineWidth}px;"
              >
                {#each hourTicks() as tick}
                  <div
                    class="text-muted-foreground absolute top-0 bottom-0 border-l border-dashed border-white/[0.06] px-2 pt-3 text-[11px]"
                    style={horizontalHoverStyle(tick)}
                  >
                    {formatTime(tick).replace(":00", "")}
                  </div>
                {/each}
              </div>
            </div>

            {#each displayedDays as day}
              <div
                class="border-border relative border-b"
                style="height:{HORIZONTAL_ROW_HEIGHT}px;"
              >
                <button
                  class="bg-surface-2/70 border-border absolute top-0 bottom-0 left-0 z-20 border-r px-3 text-left"
                  style="width:{HORIZONTAL_LABEL_WIDTH}px;"
                  data-testid={`day-header-${day.weekday}`}
                  on:click={(event) => openDayBoundsEditor(day.weekday, event)}
                >
                  <div class="text-[13px] font-semibold">{day.dateLabel}</div>
                  <div class="text-muted-foreground mt-1 text-[10px]">
                    {day.dayName}
                  </div>
                </button>
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                  class="absolute top-0 bottom-0 cursor-cell bg-[var(--timeline)]"
                  style="left:{HORIZONTAL_LABEL_WIDTH}px;width:{horizontalTimelineWidth}px;"
                  data-testid={`horizontal-day-${day.weekday}`}
                  on:pointerdown={(event) =>
                    beginDraw(event, day.weekday, "horizontal")}
                  on:pointermove={moveDraw}
                  on:pointerup={endDraw}
                  on:pointercancel={cancelDraw}
                  on:dragover={handleDayDragOver}
                  on:drop={(event) =>
                    handleDayDrop(event, day.weekday, "horizontal")}
                >
                  {#each hourTicks() as tick}
                    <div
                      class="absolute top-0 bottom-0 border-l border-dashed border-white/[0.055]"
                      style={horizontalHoverStyle(tick)}
                    ></div>
                  {/each}
                  {#if drawing && drawing.weekday === day.weekday && drawing.axis === "horizontal"}
                    <div
                      class="pointer-events-none absolute z-20 rounded-md border-2 border-dashed border-[#7aa2f7] bg-[#7aa2f7]/10"
                      style={drawingGhostStyleHorizontal(drawing)}
                      aria-hidden="true"
                    ></div>
                  {/if}

                  {#each day.items as item}
                    {@const category = categoryById(item.categoryId)}
                    {@const isSelected = selectedId === item.id}
                    <button
                      data-schedule-item
                      data-testid="schedule-item"
                      data-series-id={item.seriesId ?? ""}
                      class="focus:ring-ring absolute z-10 overflow-hidden rounded-[5px] text-left transition-shadow focus:outline-none {isSelected
                        ? 'ring-1 ring-[#7aa2f7]/70 shadow-md shadow-black/30'
                        : 'hover:bg-white/[0.02]'} {item.kind === 'pin'
                        ? 'top-1 z-20 flex h-5 items-center gap-1.5 px-1.5'
                        : 'top-8 bottom-2 pl-2.5 pr-2 border-l-2'}"
                      style="{horizontalItemStyle(item)} {item.kind === 'pin'
                        ? `background:${category.color}1a; border:1px solid ${category.color}55;`
                        : `border-left-color:${category.color}; background:${category.color}14;`}"
                      on:click={(event) => openEdit(item, event)}
                      on:pointermove={moveDrag}
                      on:pointerup={endDrag}
                      on:pointercancel={endDrag}
                    >
                      {#if item.seriesId}
                        <span
                          data-testid="series-marker"
                          class="pointer-events-none absolute top-0.5 right-0.5 z-30 h-1.5 w-1.5 rounded-full"
                          style="background:{category.color};"
                          aria-label="Part of a series"
                        ></span>
                      {/if}
                      {#if item.kind === "block"}
                        <!-- Always-active resize hit zones at the left and right edges. -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <span
                          data-testid="resize-start-handle"
                          class="absolute top-0 bottom-0 left-0 z-30 w-2 cursor-ew-resize"
                          on:pointerdown={(event) =>
                            beginDrag(
                              event,
                              item,
                              "resize-start",
                              "horizontal",
                            )}
                        ></span>
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <span
                          data-testid="resize-end-handle"
                          class="absolute top-0 right-0 bottom-0 z-30 w-2 cursor-ew-resize"
                          on:pointerdown={(event) =>
                            beginDrag(event, item, "resize-end", "horizontal")}
                        ></span>
                        <!-- Move zone covers the middle. -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <span
                          class="absolute top-0 right-2 bottom-0 left-2 z-10 cursor-grab"
                          on:pointerdown={(event) =>
                            beginDrag(event, item, "move", "horizontal")}
                        ></span>
                        {#if isSelected}
                          <!-- Visual accent on selection. -->
                          <span
                            class="pointer-events-none absolute top-1/2 left-0 z-20 h-7 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-[#7aa2f7]"
                          ></span>
                          <span
                            class="pointer-events-none absolute top-1/2 right-0 z-20 h-7 w-1.5 translate-x-1/2 -translate-y-1/2 rounded-sm bg-[#7aa2f7]"
                          ></span>
                        {/if}
                        <span
                          class="text-foreground/95 pointer-events-none relative z-20 block truncate text-[12px] font-medium tracking-tight"
                        >
                          {item.title}
                        </span>
                        <span
                          class="text-muted-foreground pointer-events-none relative z-20 mt-0.5 block truncate font-mono text-[10px] tabular-nums"
                        >
                          {formatTime(item.startMinute)
                            .replace(":00 ", "")
                            .replace(" AM", "a")
                            .replace(" PM", "p")} – {formatTime(
                            item.endMinute ?? item.startMinute,
                          )
                            .replace(":00 ", "")
                            .replace(" AM", "a")
                            .replace(" PM", "p")}
                        </span>
                      {:else}
                        <span
                          class="pointer-events-none h-2 w-2 shrink-0 rounded-full"
                          style="background:{category.color}"
                        ></span>
                        <span
                          class="text-foreground/95 pointer-events-none truncate text-[11px] font-medium"
                          >{item.title}</span
                        >
                      {/if}
                    </button>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <TodoSidebar
      todos={week.todos}
      categories={week.categories}
      onCreate={createTodoRequest}
      onUpdate={updateTodoRequest}
      onDelete={deleteTodoRequest}
      onDragStart={handleTodoDragStart}
    />
  </main>

  {#if dialogOpen}
    {@const popX = editorAnchor
      ? Math.max(12, Math.min(editorAnchor.x - 168, window.innerWidth - 348))
      : Math.max(12, window.innerWidth / 2 - 168)}
    {@const popY = editorAnchor
      ? Math.max(16, Math.min(editorAnchor.y + 8, window.innerHeight - 240))
      : 16}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="fixed inset-0 z-40"
      on:click={() => {
        dialogOpen = false;
      }}
    >
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <section
        aria-label="Add schedule item"
        class="border-border bg-surface absolute flex w-[336px] flex-col overflow-y-auto rounded-lg border p-4 shadow-2xl shadow-black/50"
        style="left:{popX}px;top:{popY}px;max-height:calc(100vh - {popY +
          16}px);"
        on:click|stopPropagation
      >
        <div class="mb-4 flex items-center justify-between gap-3">
          <h2 class="text-[14px] font-semibold tracking-tight">
            {editorMode === "edit" ? "Edit" : "Add"}
            {dialogKind === "pin" ? "pin" : "block"}
          </h2>
          {#if editorMode === "create"}
            <div
              class="bg-muted/40 flex items-center rounded-md p-0.5 text-[11px]"
              role="group"
              aria-label="Item kind"
            >
              <button
                type="button"
                class="rounded px-2 py-1 transition-colors {dialogKind ===
                'block'
                  ? 'bg-surface-2 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'}"
                aria-pressed={dialogKind === "block"}
                on:click={() => (dialogKind = "block")}
              >
                Block
              </button>
              <button
                type="button"
                class="rounded px-2 py-1 transition-colors {dialogKind === 'pin'
                  ? 'bg-surface-2 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'}"
                aria-pressed={dialogKind === "pin"}
                on:click={() => (dialogKind = "pin")}
              >
                Pin
              </button>
            </div>
          {/if}
          <button
            class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
            aria-label="Close"
            on:click={() => {
              dialogOpen = false;
            }}
          >
            <X size={15} />
          </button>
        </div>
        <div class="space-y-3 text-[12px]">
          <label class="block">
            <span class="text-muted-foreground mb-1 block">Title</span>
            <input
              class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 outline-none focus:border-[#7aa2f7]"
              aria-label="Title"
              bind:value={draft.title}
            />
          </label>
          <div class="block">
            <span class="text-muted-foreground mb-1 block">Days</span>
            <div
              role="group"
              aria-label="Days"
              class="flex gap-1"
              data-testid="day-chips"
            >
              {#each [1, 2, 3, 4, 5, 6, 7] as wd (wd)}
                {@const active = draftWeekdays.includes(wd as Weekday)}
                <button
                  type="button"
                  class="border-border h-7 flex-1 rounded-md border text-[11px] font-medium tabular-nums transition-colors {active
                    ? 'border-[#7aa2f7]/60 bg-[#7aa2f7]/15 text-foreground'
                    : 'bg-muted/20 text-muted-foreground hover:bg-muted/40'}"
                  aria-pressed={active}
                  aria-label={`Toggle ${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][wd - 1]}`}
                  data-testid={`day-chip-${wd}`}
                  on:click={() => toggleDraftWeekday(wd as Weekday)}
                >
                  {DAY_LETTERS[wd - 1]}
                </button>
              {/each}
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="text-muted-foreground mb-1 block">Start time</span>
              <input
                class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 outline-none"
                aria-label="Start time"
                placeholder="4:25 AM"
                bind:value={draftStartTime}
              />
            </label>
            {#if dialogKind === "block"}
              <label class="block">
                <span class="text-muted-foreground mb-1 block">End time</span>
                <input
                  class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 outline-none"
                  aria-label="End time"
                  placeholder="5:15 AM"
                  bind:value={draftEndTime}
                />
              </label>
            {/if}
          </div>
          <label class="block">
            <span class="text-muted-foreground mb-1 block">Category</span>
            <select
              class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 outline-none"
              aria-label="Category"
              bind:value={draft.categoryId}
            >
              {#each week.categories as category}
                <option value={category.id}>{category.name}</option>
              {/each}
            </select>
          </label>
          <label class="block">
            <span class="text-muted-foreground mb-1 block">Notes</span>
            <textarea
              class="border-border bg-muted/30 min-h-20 w-full rounded-md border px-2 py-1.5 outline-none focus:border-[#7aa2f7]"
              aria-label="Notes"
              bind:value={draft.notes}
            ></textarea>
          </label>
          {#if editorError}
            <div
              class="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-red-200"
            >
              {editorError}
            </div>
          {/if}
        </div>
        <div class="mt-5 flex flex-wrap justify-end gap-2">
          {#if editorMode === "edit"}
            <button
              class="mr-auto rounded-md border border-red-400/30 px-3 py-2 text-[12px] text-red-300 hover:bg-red-500/10"
              on:click={deleteEditingItem}
            >
              Delete
            </button>
            {#if draft.seriesId}
              <button
                class="rounded-md border border-red-400/30 px-3 py-2 text-[12px] text-red-300 hover:bg-red-500/10"
                data-testid="delete-series"
                on:click={deleteEditingSeries}
              >
                Delete series
              </button>
              <button
                class="border-border text-muted-foreground hover:bg-muted rounded-md border px-3 py-2 text-[12px]"
                data-testid="detach-series"
                on:click={detachFromSeries}
              >
                Detach
              </button>
            {/if}
            <button
              class="border-border text-muted-foreground hover:bg-muted rounded-md border px-3 py-2 text-[12px]"
              on:click={duplicateSelected}
            >
              Duplicate
            </button>
          {/if}
          <button
            class="border-border text-muted-foreground hover:bg-muted rounded-md border px-3 py-2 text-[12px]"
            on:click={() => {
              dialogOpen = false;
            }}>Cancel</button
          >
          <button
            class="rounded-md bg-[#7aa2f7] px-3 py-2 text-[12px] font-semibold text-[#101014] hover:bg-[#9eceff]"
            on:click={saveItem}
            >{editorMode === "edit" ? "Save" : "Create"}</button
          >
        </div>
      </section>
    </div>
  {/if}

  {#if dayBoundsEditor}
    {@const wakePopX = Math.max(
      12,
      Math.min(dayBoundsEditor.anchor.x - 140, window.innerWidth - 292),
    )}
    {@const wakePopY = Math.max(
      16,
      Math.min(dayBoundsEditor.anchor.y + 8, window.innerHeight - 240),
    )}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      role="presentation"
      class="fixed inset-0 z-40"
      on:click={() => (dayBoundsEditor = null)}
    >
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <section
        aria-label="Day wake and sleep"
        data-testid="day-bounds-editor"
        class="border-border bg-surface absolute flex w-[280px] flex-col rounded-lg border p-4 shadow-2xl shadow-black/50"
        style="left:{wakePopX}px;top:{wakePopY}px;"
        on:click|stopPropagation
      >
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-[13px] font-semibold tracking-tight">
            {week.days.find((d) => d.weekday === dayBoundsEditor!.weekday)
              ?.dateLabel ?? ""}
          </h2>
          <button
            type="button"
            class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
            aria-label="Close"
            on:click={() => (dayBoundsEditor = null)}
          >
            <X size={14} />
          </button>
        </div>
        <label class="block">
          <span class="text-muted-foreground mb-1 block text-[11px]">Wake</span>
          <input
            aria-label="Wake time"
            class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 text-[12px] outline-none focus:border-[#7aa2f7]"
            placeholder="5:30 AM"
            bind:value={dayBoundsEditor.wakeText}
          />
        </label>
        <label class="mt-3 block">
          <span class="text-muted-foreground mb-1 block text-[11px]">Sleep</span
          >
          <input
            aria-label="Sleep time"
            class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 text-[12px] outline-none focus:border-[#7aa2f7]"
            placeholder="10:00 PM"
            bind:value={dayBoundsEditor.sleepText}
          />
        </label>
        {#if dayBoundsEditor.error}
          <div
            class="mt-3 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200"
          >
            {dayBoundsEditor.error}
          </div>
        {/if}
        <div class="mt-4 flex justify-end gap-2">
          <button
            class="border-border text-muted-foreground hover:bg-muted rounded-md border px-3 py-1.5 text-[12px]"
            on:click={() => (dayBoundsEditor = null)}>Cancel</button
          >
          <button
            class="rounded-md bg-[#7aa2f7] px-3 py-1.5 text-[12px] font-semibold text-[#101014] hover:bg-[#9eceff]"
            on:click={saveDayBounds}>Save</button
          >
        </div>
      </section>
    </div>
  {/if}

  {#if settingsOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="fixed inset-0 z-30 flex justify-end bg-black/40 backdrop-blur-sm"
      on:click={() => (settingsOpen = false)}
    >
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <aside
        class="border-border bg-surface flex h-full w-[360px] flex-col border-l shadow-2xl shadow-black/40"
        on:click|stopPropagation
      >
        <div
          class="border-border flex items-center justify-between border-b p-4"
        >
          <h2 class="text-[14px] font-semibold tracking-tight">Settings</h2>
          <button
            class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
            aria-label="Close"
            on:click={() => (settingsOpen = false)}
          >
            <X size={15} />
          </button>
        </div>
        <div class="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          <section>
            <div
              class="text-muted-foreground mb-2 text-[10px] font-semibold tracking-[0.12em] uppercase"
            >
              Categories &amp; budgets
            </div>
            <CategoryEditor
              categories={week.categories}
              inUseIds={categoryInUseIds}
              onUpdate={updateCategorySettings}
              onCreate={createCategoryRequest}
              onDelete={deleteCategoryRequest}
              onReorder={reorderCategoryRequest}
            />
            {#if categoryDeleteError}
              <div
                class="mt-2 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200"
                data-testid="category-delete-error"
              >
                {categoryDeleteError}
              </div>
            {/if}
          </section>

          <section>
            <div
              class="text-muted-foreground mb-2 text-[10px] font-semibold tracking-[0.12em] uppercase"
            >
              Theme
            </div>
            <div class="grid grid-cols-2 gap-2">
              {#each APP_THEMES as theme}
                <button
                  class="border-border hover:bg-muted/60 rounded-md border p-2 text-left {theme.id ===
                  themeId
                    ? 'ring-ring bg-muted/70 ring-2'
                    : 'bg-muted/20'}"
                  data-testid={`theme-${theme.id}`}
                  on:click={() => (themeId = theme.id)}
                >
                  <div class="mb-2 flex gap-1">
                    {#each theme.palette as color}
                      <span
                        class="h-4 flex-1 rounded-sm border border-black/10"
                        style="background:{color}"
                      ></span>
                    {/each}
                  </div>
                  <div class="truncate text-[11px] font-semibold">
                    {theme.name}
                  </div>
                  <div class="text-muted-foreground text-[10px] capitalize">
                    {theme.mode}
                  </div>
                </button>
              {/each}
            </div>
          </section>
        </div>
      </aside>
    </div>
  {/if}

  {#if versionMenuOpen}
    <VersionMenu
      versions={week.versions}
      activeId={week.templateId}
      defaultId={week.defaultTemplateId}
      onActivate={activateVersion}
      onCreate={createSandboxVersion}
      onRename={renameVersion}
      onDelete={deleteVersion}
      onClose={() => (versionMenuOpen = false)}
    />
  {/if}
</div>

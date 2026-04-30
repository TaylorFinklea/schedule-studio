<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { onMount, untrack } from "svelte";
  import {
    Check,
    ChevronDown,
    ChevronRight,
    Clock3,
    Copy,
    Plus,
    Trash2,
    X,
  } from "lucide-svelte";
  import AppShell from "$lib/components/AppShell.svelte";
  import BudgetStrip from "$lib/components/BudgetStrip.svelte";
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
    OverlapWarning,
    ScheduleItem,
    WeekView,
    Weekday,
  } from "$lib/types";

  let { data } = $props<{ data: { week: WeekView } }>();

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
  const HORIZONTAL_PIN_LANE_HEIGHT = 30;
  const HOVER_TOOLBAR_WIDTH = 252;

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
  let editorError = $state("");
  let dayFocus = $state(false);
  let visibleDay = $state<Weekday>(4);
  let newVersionName = $state("");
  let hourHeight = $state(DEFAULT_HOUR_HEIGHT);
  let layoutMode = $state<"vertical" | "horizontal">("horizontal");
  let sidebarPanel = $state<"overview" | "editor" | "settings">("overview");
  let versionsCollapsed = $state(false);
  let categoriesCollapsed = $state(false);
  let dailyTotalsCollapsed = $state(false);
  let themeId = $state(DEFAULT_THEME_ID);
  let hoverAdd = $state<{ weekday: Weekday; minute: number } | null>(null);
  let dragging = $state<{
    id: string;
    mode: "move" | "resize-start" | "resize-end";
    axis: "vertical" | "horizontal";
    originY: number;
    originStart: number;
    originEnd: number | null;
    originWeekday: Weekday;
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
  const displayedDays = $derived(
    dayFocus
      ? week.days.filter((day) => day.weekday === visibleDay)
      : week.days,
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
      completed: false,
    };
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
    editorError = "";
    hoverAdd = null;
    dialogOpen = true;
    sidebarPanel = "editor";
  }

  function openEdit(item: ScheduleItem) {
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
      completed: item.completed,
    };
    draftStartTime = formatTime(item.startMinute);
    draftEndTime = formatTime(item.endMinute ?? item.startMinute);
    editorError = "";
    selectedId = item.id;
    dialogOpen = true;
    sidebarPanel = "editor";
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
    editorError = "";
    return {
      ...draft,
      kind: dialogKind,
      startMinute,
      endMinute: dialogKind === "pin" ? null : endMinute,
    };
  }

  async function saveItem() {
    const payload = draftForSave();
    if (!payload) return;
    const url =
      editorMode === "edit" && editingId
        ? `/api/items/${editingId}`
        : "/api/items";
    const item = await fetch(url, {
      method: editorMode === "edit" && editingId ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).then((response) => response.json());
    dialogOpen = false;
    sidebarPanel = "overview";
    selectedId = item.id ?? selectedId;
    await invalidateAll();
  }

  async function deleteEditingItem() {
    if (!editingId) return;
    await fetch(`/api/items/${editingId}`, { method: "DELETE" });
    dialogOpen = false;
    sidebarPanel = "overview";
    selectedId = null;
    await invalidateAll();
  }

  async function persistItem(item: ScheduleItem) {
    await fetch(`/api/items/${item.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(item),
    });
    await invalidateAll();
  }

  async function deleteSelected() {
    if (!selected) return;
    await fetch(`/api/items/${selected.id}`, { method: "DELETE" });
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
    await fetch("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(copy),
    });
    await invalidateAll();
  }

  async function createSandboxVersion() {
    const name = newVersionName.trim() || `${week.templateName} sandbox`;
    await fetch("/api/versions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, sourceTemplateId: week.templateId }),
    });
    newVersionName = "";
    selectedId = null;
    await invalidateAll();
  }

  async function activateVersion(id: string) {
    await fetch(`/api/versions/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "activate" }),
    });
    selectedId = null;
    await invalidateAll();
  }

  async function renameActiveVersion() {
    const nextName = newVersionName.trim();
    if (!nextName) return;
    await fetch(`/api/versions/${week.templateId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nextName }),
    });
    newVersionName = "";
    await invalidateAll();
  }

  async function deleteCurrentSandbox() {
    if (week.templateId === week.defaultTemplateId) return;
    await fetch(`/api/versions/${week.templateId}`, { method: "DELETE" });
    selectedId = null;
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
    sidebarPanel = sidebarPanel === "settings" ? "overview" : "settings";
    dialogOpen = false;
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

  function hoverAddStyle(minute: number) {
    return `top:${((minute - maxStart) / totalGridMinutes) * 100}%`;
  }

  function canShowHoverAdd(day: WeekView["days"][number]) {
    return !dialogOpen && !dragging && hoverAdd?.weekday === day.weekday;
  }

  function updateHoverAdd(
    event: PointerEvent,
    weekday: Weekday,
    axis: "vertical" | "horizontal" = "vertical",
  ) {
    if (
      dialogOpen ||
      dragging ||
      (event.target instanceof Element &&
        event.target.closest("[data-schedule-item]"))
    ) {
      hoverAdd = null;
      return;
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const offset =
      axis === "horizontal"
        ? Math.max(0, Math.min(rect.width, event.clientX - rect.left))
        : Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const rawMinute = maxStart + (offset / hourHeight) * 60;
    const maxHoverStart = Math.max(maxStart, maxEnd - HOVER_BLOCK_DURATION);
    hoverAdd = {
      weekday,
      minute: Math.max(
        maxStart,
        Math.min(maxHoverStart, snapMinute(rawMinute)),
      ),
    };
  }

  function clearHoverAdd(weekday: Weekday) {
    if (hoverAdd?.weekday === weekday) hoverAdd = null;
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
    const deltaMinutes = snapMinute(
      ((pointer - dragging.originY) / hourHeight) * 60,
    );
    let startMinute = dragging.originStart;
    let endMinute = dragging.originEnd;

    if (dragging.mode === "move") {
      startMinute = snapMinute(dragging.originStart + deltaMinutes);
      endMinute =
        dragging.originEnd === null
          ? null
          : snapMinute(dragging.originEnd + deltaMinutes);
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
    const item = allItems().find(
      (candidate: ScheduleItem) => candidate.id === dragging?.id,
    );
    dragging = null;
    if (item) await persistItem(item);
  }

  function updateLocalItem(id: string, patch: Partial<ScheduleItem>) {
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

  function horizontalHoverToolbarStyle(minute: number) {
    const left = ((minute - maxStart) / 60) * hourHeight;
    const clamped = Math.max(
      8,
      Math.min(left - HOVER_TOOLBAR_WIDTH / 2, horizontalTimelineWidth - HOVER_TOOLBAR_WIDTH - 8),
    );
    return `left:${clamped}px;width:${HOVER_TOOLBAR_WIDTH}px;`;
  }

  function selectedDayLabel(weekday: Weekday) {
    return week.days.find((day) => day.weekday === weekday)?.dateLabel ?? "";
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
  />
  <BudgetStrip
    categories={week.categories}
    budgets={week.categoryBudgets}
  />

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
              on:click={() => (visibleDay = day.weekday)}
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
              <div
                class="border-border/80 relative border-r bg-[var(--timeline)]"
                data-testid={`day-column-${day.weekday}`}
                on:pointermove={(event) => updateHoverAdd(event, day.weekday)}
                on:pointerleave={() => clearHoverAdd(day.weekday)}
              >
                {#each hourTicks() as tick}
                  <div
                    class="absolute right-0 left-0 border-t border-dashed border-white/[0.055]"
                    style={tickStyle(tick)}
                  ></div>
                {/each}
                {#if canShowHoverAdd(day) && hoverAdd}
                  {@const add = hoverAdd}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="absolute right-3 left-3 z-20 flex -translate-y-1/2 items-center gap-2 rounded-md border border-[#7aa2f7]/45 bg-[#1a1b26]/95 px-2 py-1 shadow-xl shadow-black/25 backdrop-blur"
                    style={hoverAddStyle(add.minute)}
                    data-testid="hover-add-toolbar"
                    on:pointerdown|stopPropagation
                  >
                    <span class="min-w-12 font-mono text-[11px] text-[#a9b1d6]"
                      >{formatTime(add.minute)
                        .replace(" AM", "")
                        .replace(" PM", "")}</span
                    >
                    <button
                      class="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded border border-[#bb9af7]/35 bg-[#bb9af7]/18 px-2 text-[11px] font-semibold text-[#d7c6ff] hover:bg-[#bb9af7]/28"
                      data-testid="hover-add-block"
                      aria-label={`Add block at ${formatTime(add.minute)} on ${day.dateLabel}`}
                      on:click|stopPropagation={() =>
                        openCreate(
                          "block",
                          day.weekday,
                          add.minute,
                          HOVER_BLOCK_DURATION,
                        )}
                    >
                      <Plus size={13} /> Block
                    </button>
                    <button
                      class="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded border border-[#9ece6a]/30 bg-[#9ece6a]/16 px-2 text-[11px] font-semibold text-[#d3f6aa] hover:bg-[#9ece6a]/24"
                      data-testid="hover-add-pin"
                      aria-label={`Add pin at ${formatTime(add.minute)} on ${day.dateLabel}`}
                      on:click|stopPropagation={() =>
                        openCreate(
                          "pin",
                          day.weekday,
                          add.minute,
                          HOVER_BLOCK_DURATION,
                        )}
                    >
                      <Plus size={13} /> Pin
                    </button>
                  </div>
                {/if}

                {#each day.items as item}
                  {@const category = categoryById(item.categoryId)}
                  {@const itemWarnings = warningsFor(item.id)}
                  {@const density = itemDensity(item)}
                  <button
                    data-schedule-item
                    data-testid="schedule-item"
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
                    on:click={() => openEdit(item)}
                    on:dblclick={() => openEdit(item)}
                    on:pointermove={moveDrag}
                    on:pointerup={endDrag}
                    on:pointercancel={endDrag}
                  >
                    {#if item.kind === "block"}
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <span
                        data-testid="resize-start-handle"
                        class="absolute top-0 left-1/2 z-30 h-2 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-full border border-white/60 bg-white/80 {selectedId ===
                        item.id
                          ? ''
                          : 'hidden'}"
                        on:pointerdown={(event) =>
                          beginDrag(event, item, "resize-start")}
                      ></span>
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <span
                        data-testid="resize-end-handle"
                        class="absolute bottom-0 left-1/2 z-30 h-2 w-10 -translate-x-1/2 translate-y-1/2 cursor-ns-resize rounded-full border border-white/60 bg-white/80 {selectedId ===
                        item.id
                          ? ''
                          : 'hidden'}"
                        on:pointerdown={(event) =>
                          beginDrag(event, item, "resize-end")}
                      ></span>
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <span
                        class="absolute inset-0 z-10 cursor-grab"
                        on:pointerdown={(event) =>
                          beginDrag(event, item, "move")}
                      ></span>
                      {#if density === "micro"}
                        <span
                          class="relative block truncate text-[11px] leading-[16px] font-semibold"
                          title={`${item.title}: ${formatTime(item.startMinute)} - ${formatTime(item.endMinute ?? item.startMinute)}`}
                        >
                          {item.title}
                        </span>
                      {:else if density === "compact"}
                        <span
                          class="relative block truncate text-[11px] leading-[18px] font-semibold"
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
                          class="relative block truncate text-[12px] leading-[17px] font-semibold"
                          >{item.title}</span
                        >
                        <span
                          class="text-foreground/70 relative mt-0.5 block truncate text-[11px] leading-[14px]"
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
                          class="relative mt-1 inline-flex rounded bg-red-500/80 px-1.5 py-0.5 text-[10px] font-semibold text-white"
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
                      <span
                        class="border-muted-foreground/60 ml-auto flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px]"
                      >
                        {#if item.completed}<Check size={10} />{/if}
                      </span>
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
                  on:click={() => (visibleDay = day.weekday)}
                >
                  <div class="text-[13px] font-semibold">{day.dateLabel}</div>
                  <div class="text-muted-foreground mt-1 text-[10px]">
                    {day.dayName}
                  </div>
                </button>
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="absolute top-0 bottom-0 bg-[var(--timeline)]"
                  style="left:{HORIZONTAL_LABEL_WIDTH}px;width:{horizontalTimelineWidth}px;"
                  data-testid={`horizontal-day-${day.weekday}`}
                  on:pointermove={(event) =>
                    updateHoverAdd(event, day.weekday, "horizontal")}
                  on:pointerleave={() => clearHoverAdd(day.weekday)}
                >
                  {#each hourTicks() as tick}
                    <div
                      class="absolute top-0 bottom-0 border-l border-dashed border-white/[0.055]"
                      style={horizontalHoverStyle(tick)}
                    ></div>
                  {/each}
                  {#if canShowHoverAdd(day) && hoverAdd}
                    {@const add = hoverAdd}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      class="absolute top-1 z-50 flex items-center gap-1.5 rounded-md border border-[#7aa2f7]/45 bg-[#1a1b26]/95 px-2 py-1 shadow-xl shadow-black/25 backdrop-blur"
                      style={horizontalHoverToolbarStyle(add.minute)}
                      data-testid="hover-add-toolbar"
                      on:pointerdown|stopPropagation
                    >
                      <span class="font-mono text-[11px] text-[#a9b1d6]"
                        >{formatTime(add.minute)
                          .replace(" AM", "")
                          .replace(" PM", "")}</span
                      >
                      <button
                        class="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-[#bb9af7]/35 bg-[#bb9af7]/18 px-2 text-[11px] font-semibold text-[#d7c6ff] hover:bg-[#bb9af7]/28"
                        data-testid="hover-add-block"
                        on:click|stopPropagation={() =>
                          openCreate(
                            "block",
                            day.weekday,
                            add.minute,
                            HOVER_BLOCK_DURATION,
                          )}
                      >
                        <Plus size={13} /> Block
                      </button>
                      <button
                        class="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-[#9ece6a]/30 bg-[#9ece6a]/16 px-2 text-[11px] font-semibold text-[#d3f6aa] hover:bg-[#9ece6a]/24"
                        data-testid="hover-add-pin"
                        on:click|stopPropagation={() =>
                          openCreate(
                            "pin",
                            day.weekday,
                            add.minute,
                            HOVER_BLOCK_DURATION,
                          )}
                      >
                        <Plus size={13} /> Pin
                      </button>
                    </div>
                  {/if}

                  {#each day.items as item}
                    {@const category = categoryById(item.categoryId)}
                    {@const isSelected = selectedId === item.id}
                    <button
                      data-schedule-item
                      data-testid="schedule-item"
                      class="focus:ring-ring absolute z-10 overflow-hidden rounded-[5px] text-left transition-shadow focus:outline-none {isSelected
                        ? 'ring-1 ring-[#7aa2f7]/70 shadow-md shadow-black/30'
                        : 'hover:bg-white/[0.02]'} {item.kind === 'pin'
                        ? 'top-1/2 -translate-y-1/2 z-20 flex h-5 items-center gap-1.5 px-1.5'
                        : 'top-2 bottom-2 pl-2.5 pr-2 border-l-2'}"
                      style="{horizontalItemStyle(item)} {item.kind === 'pin'
                        ? `background:${category.color}1a; border:1px solid ${category.color}55;`
                        : `border-left-color:${category.color}; background:${category.color}14;`}"
                      on:click={() => openEdit(item)}
                      on:pointermove={moveDrag}
                      on:pointerup={endDrag}
                      on:pointercancel={endDrag}
                    >
                      {#if item.kind === "block"}
                        {#if isSelected}
                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                          <span
                            data-testid="resize-start-handle"
                            class="absolute top-1/2 left-0 z-30 h-7 w-1.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm bg-[#7aa2f7]"
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
                            class="absolute top-1/2 right-0 z-30 h-7 w-1.5 translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm bg-[#7aa2f7]"
                            on:pointerdown={(event) =>
                              beginDrag(event, item, "resize-end", "horizontal")}
                          ></span>
                        {/if}
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <span
                          class="absolute inset-0 z-10 cursor-grab"
                          on:pointerdown={(event) =>
                            beginDrag(event, item, "move", "horizontal")}
                        ></span>
                        <span
                          class="text-foreground/95 relative z-20 block truncate text-[12px] font-medium tracking-tight"
                        >
                          {item.title}
                        </span>
                        <span
                          class="text-muted-foreground relative z-20 mt-0.5 block truncate font-mono text-[10px] tabular-nums"
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
                          class="h-2 w-2 shrink-0 rounded-full"
                          style="background:{category.color}"
                        ></span>
                        <span
                          class="text-foreground/95 truncate text-[11px] font-medium"
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

  </main>

  {#if dialogOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="fixed inset-0 z-40 flex items-start justify-center bg-black/50 px-4 pt-24 backdrop-blur-sm"
      on:click={() => {
        dialogOpen = false;
        sidebarPanel = "overview";
      }}
    >
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <section
        aria-label="Add schedule item"
        class="border-border bg-surface relative w-full max-w-md rounded-lg border p-5 shadow-2xl shadow-black/40"
        on:click|stopPropagation
      >
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-[14px] font-semibold tracking-tight">
            {editorMode === "edit" ? "Edit" : "Add"}
            {dialogKind === "pin" ? "pin" : "block"}
          </h2>
          <button
            class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
            aria-label="Close"
            on:click={() => {
              dialogOpen = false;
              sidebarPanel = "overview";
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
          <div class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="text-muted-foreground mb-1 block">Day</span>
              <select
                class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 outline-none"
                aria-label="Day"
                bind:value={draft.weekday}
              >
                {#each week.days as day}
                  <option value={day.weekday}>{day.dateLabel}</option>
                {/each}
              </select>
            </label>
            <label class="block">
              <span class="text-muted-foreground mb-1 block">Start time</span>
              <input
                class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 outline-none"
                aria-label="Start time"
                placeholder="4:25 AM"
                bind:value={draftStartTime}
              />
            </label>
          </div>
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
              sidebarPanel = "overview";
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

  {#if sidebarPanel === "settings"}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="fixed inset-0 z-30 flex justify-end bg-black/40 backdrop-blur-sm"
      on:click={() => (sidebarPanel = "overview")}
    >
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <aside
        class="border-border bg-surface flex h-full w-[360px] flex-col border-l shadow-2xl shadow-black/40"
        on:click|stopPropagation
      >
        <div class="border-border flex items-center justify-between border-b p-4">
          <h2 class="text-[14px] font-semibold tracking-tight">Settings</h2>
          <button
            class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
            aria-label="Close"
            on:click={() => (sidebarPanel = "overview")}
          >
            <X size={15} />
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <div class="text-muted-foreground mb-2 text-[10px] font-semibold tracking-[0.12em] uppercase">
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
        </div>
      </aside>
    </div>
  {/if}
</div>

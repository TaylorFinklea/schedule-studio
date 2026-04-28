<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { Tooltip } from "bits-ui";
  import { onMount, untrack } from "svelte";
  import {
    CalendarDays,
    Check,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Copy,
    Database,
    Grid2X2,
    MoreVertical,
    Plus,
    Settings,
    Trash2,
    Undo2,
    X,
    ZoomIn,
    ZoomOut,
  } from "lucide-svelte";
  import {
    formatDuration,
    formatTime,
    SNAP_MINUTES,
    snapMinute,
  } from "$lib/schedule";
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
  const MAX_HOUR_HEIGHT = 360;
  const ZOOM_STEP = 8;
  const PIN_HEIGHT = 28;
  const MIN_BLOCK_HEIGHT = 16;
  const DEFAULT_BLOCK_DURATION = 60;
  const HOVER_BLOCK_DURATION = 30;

  // svelte-ignore state_referenced_locally -- local planner state is resynced from loader data below after mutations.
  let week = $state<WeekView>(data.week);
  let selectedId = $state<string | null>(null);
  let dialogOpen = $state(false);
  let dialogKind = $state<"block" | "pin">("block");
  let draft = $state<ItemInput>(newDraft("block", 1, 9 * 60));
  let dayFocus = $state(false);
  let visibleDay = $state<Weekday>(4);
  let newVersionName = $state("");
  let hourHeight = $state(DEFAULT_HOUR_HEIGHT);
  let hoverAdd = $state<{ weekday: Weekday; minute: number } | null>(null);
  let dragging = $state<{
    id: string;
    mode: "move" | "resize-start" | "resize-end";
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
  });

  $effect(() => {
    localStorage.setItem("schedule-studio-hour-height", String(hourHeight));
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
    Math.min(
      ...week.days.map(
        (day) => day.bounds.wakeMinute - day.bounds.bufferBefore,
      ),
    ),
  );
  const maxEnd = $derived(
    Math.max(
      ...week.days.map(
        (day) => day.bounds.sleepMinute + day.bounds.bufferAfter,
      ),
    ),
  );
  const totalGridMinutes = $derived(maxEnd - maxStart);
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
    dialogKind = kind;
    draft = newDraft(kind, weekday, startMinute, duration);
    hoverAdd = null;
    dialogOpen = true;
  }

  async function createItem() {
    await fetch("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    dialogOpen = false;
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

  function updateHoverAdd(event: PointerEvent, weekday: Weekday) {
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
    const offsetY = Math.max(
      0,
      Math.min(rect.height, event.clientY - rect.top),
    );
    const rawMinute = maxStart + (offsetY / hourHeight) * 60;
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
  ) {
    if (item.kind === "pin" && mode !== "move") return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging = {
      id: item.id,
      mode,
      originY: event.clientY,
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
    const deltaMinutes = snapMinute(
      ((event.clientY - dragging.originY) / hourHeight) * 60,
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

  function dateRangeLabel() {
    const start = new Date(`${week.weekStart}T00:00:00`);
    const end = new Date(`${week.weekEnd}T00:00:00`);
    return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }
</script>

<div
  class="bg-background text-foreground flex h-screen flex-col overflow-hidden"
>
  <header
    class="border-border bg-surface flex h-14 shrink-0 items-center gap-3 border-b px-3 shadow-[0_1px_0_rgba(255,255,255,0.03)]"
  >
    <div
      class="border-border bg-muted/50 flex h-8 w-8 items-center justify-center rounded-md border"
    >
      <CalendarDays size={17} class="text-muted-foreground" />
    </div>
    <h1 class="mr-4 text-[18px] font-semibold tracking-tight">
      Schedule Studio
    </h1>

    <button
      class="border-border bg-muted/35 text-foreground/90 hover:bg-muted h-8 rounded-md border px-3 text-[12px] font-medium"
    >
      {week.templateName}
    </button>
    <button
      class="text-muted-foreground hover:bg-muted hover:text-foreground ml-2 rounded-md p-2"
      title="Previous week"><ChevronLeft size={16} /></button
    >
    <button
      class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-2"
      title="Next week"><ChevronRight size={16} /></button
    >
    <div class="bg-border h-6 w-px"></div>
    <div class="text-foreground/90 flex items-center gap-2 text-[13px]">
      <CalendarDays size={15} class="text-muted-foreground" />
      <span>{dateRangeLabel()}</span>
    </div>

    <div class="ml-auto flex items-center gap-2">
      <button
        class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-2"
        title="Undo"><Undo2 size={15} /></button
      >
      <button
        class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-2"
        title="Settings"><Settings size={15} /></button
      >
      <button
        class="flex h-8 items-center gap-2 rounded-md border border-[#bb9af7]/35 bg-[#bb9af7]/20 px-3 text-[12px] font-semibold text-[#d7c6ff] hover:bg-[#bb9af7]/30"
        on:click={() => openCreate("block")}
      >
        <Plus size={15} /> Add block
      </button>
      <button
        class="flex h-8 items-center gap-2 rounded-md border border-[#9ece6a]/30 bg-[#9ece6a]/16 px-3 text-[12px] font-semibold text-[#d3f6aa] hover:bg-[#9ece6a]/24"
        on:click={() => openCreate("pin")}
      >
        <Plus size={15} /> Add pin
      </button>
      <div class="bg-border mx-2 h-6 w-px"></div>
      <div
        class="border-border bg-muted/30 text-muted-foreground flex h-8 items-center gap-2 rounded-md border px-2"
      >
        <button
          class="hover:bg-muted hover:text-foreground rounded p-1"
          title="Zoom out"
          on:click={() => setZoom(hourHeight - ZOOM_STEP)}
        >
          <ZoomOut size={14} />
        </button>
        <input
          class="h-1.5 w-24 accent-[#7aa2f7]"
          aria-label="Timeline zoom"
          type="range"
          min={MIN_HOUR_HEIGHT}
          max={MAX_HOUR_HEIGHT}
          step={ZOOM_STEP}
          value={hourHeight}
          on:input={(event) => setZoom(Number(event.currentTarget.value))}
        />
        <button
          class="hover:bg-muted hover:text-foreground rounded p-1"
          title="Zoom in"
          on:click={() => setZoom(hourHeight + ZOOM_STEP)}
        >
          <ZoomIn size={14} />
        </button>
        <button
          class="hover:bg-muted hover:text-foreground min-w-10 rounded px-1 text-[11px] font-medium tabular-nums"
          title="Reset zoom"
          on:click={() => setZoom(DEFAULT_HOUR_HEIGHT)}
        >
          {zoomPercent()}%
        </button>
      </div>
      <label
        class="border-border bg-muted/30 text-muted-foreground flex h-8 items-center gap-2 rounded-md border px-3 text-[12px] has-checked:border-[#7aa2f7]/60 has-checked:text-[#c0caf5]"
      >
        Day focus
        <input class="sr-only" type="checkbox" bind:checked={dayFocus} />
        <span
          class="border-border bg-surface-2 flex h-4 w-4 items-center justify-center rounded-full border"
        >
          {#if dayFocus}<Check size={11} />{/if}
        </span>
      </label>
      <button
        class="border-border bg-muted/30 text-muted-foreground hover:text-foreground rounded-md border p-2"
        title="Grid"><Grid2X2 size={16} /></button
      >
      <button
        class="border-border bg-muted/30 text-muted-foreground hover:text-foreground rounded-md border p-2"
        title="More"><MoreVertical size={16} /></button
      >
    </div>
  </header>

  <main class="flex min-h-0 flex-1">
    <section class="flex min-w-0 flex-1 flex-col">
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

      <div class="relative min-h-0 flex-1 overflow-auto">
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
              class="border-border/80 relative border-r bg-[#11131f]"
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
              <div
                class="absolute right-0 left-0 bg-sky-300/[0.055]"
                style={boundsStyle(
                  day.bounds.wakeMinute - day.bounds.bufferBefore,
                  day.bounds.wakeMinute,
                )}
              >
                <span class="px-3 py-1 text-[10px] text-sky-200/60">Buffer</span
                >
              </div>
              <div
                class="absolute right-0 left-0 bg-slate-300/[0.045]"
                style={boundsStyle(
                  day.bounds.sleepMinute,
                  day.bounds.sleepMinute + day.bounds.bufferAfter,
                )}
              >
                <span class="px-3 py-1 text-[10px] text-slate-200/60"
                  >Buffer</span
                >
              </div>
              <div
                class="absolute right-0 left-0 border-t border-sky-300/20 bg-sky-300/[0.035]"
                style={boundsStyle(
                  day.bounds.wakeMinute,
                  day.bounds.wakeMinute + 30,
                )}
              >
                <span class="px-3 py-1 text-[10px] text-sky-100/55">Wake</span>
              </div>
              <div
                class="absolute right-0 left-0 border-t border-slate-200/15 bg-slate-300/[0.04]"
                style={boundsStyle(
                  day.bounds.sleepMinute - 30,
                  day.bounds.sleepMinute,
                )}
              >
                <span class="px-3 py-1 text-[10px] text-slate-100/55"
                  >Sleep</span
                >
              </div>

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
                  on:click={() => (selectedId = item.id)}
                  on:pointermove={moveDrag}
                  on:pointerup={endDrag}
                  on:pointercancel={endDrag}
                >
                  {#if item.kind === "block"}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <span
                      class="absolute top-0 left-1/2 h-2 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-full border border-white/60 bg-white/80 {selectedId ===
                      item.id
                        ? ''
                        : 'hidden'}"
                      on:pointerdown={(event) =>
                        beginDrag(event, item, "resize-start")}
                    ></span>
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <span
                      class="absolute bottom-0 left-1/2 h-2 w-10 -translate-x-1/2 translate-y-1/2 cursor-ns-resize rounded-full border border-white/60 bg-white/80 {selectedId ===
                      item.id
                        ? ''
                        : 'hidden'}"
                      on:pointerdown={(event) =>
                        beginDrag(event, item, "resize-end")}
                    ></span>
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <span
                      class="absolute inset-0 cursor-grab"
                      on:pointerdown={(event) => beginDrag(event, item, "move")}
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
      </div>
    </section>

    <aside
      class="border-border bg-surface flex w-[286px] shrink-0 flex-col border-l"
    >
      <section class="border-border border-b p-4">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-[13px] font-semibold">Schedule versions</h2>
          <span
            class="rounded border border-[#7aa2f7]/30 px-1.5 py-0.5 text-[10px] text-[#a9c3ff]"
            >Active</span
          >
        </div>
        <div class="mb-3 space-y-1">
          {#each week.versions as version}
            <button
              class="flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left text-[12px] {version.isActive
                ? 'border-[#7aa2f7]/60 bg-[#7aa2f7]/14 text-[#c0caf5]'
                : 'hover:bg-muted/45 border-transparent'}"
              on:click={() => activateVersion(version.id)}
              title={version.isDefault
                ? "Default schedule"
                : "Sandbox schedule"}
            >
              <span
                class="h-2.5 w-2.5 rounded-full {version.isDefault
                  ? 'bg-[#9ece6a]'
                  : 'bg-[#bb9af7]'}"
              ></span>
              <span class="min-w-0 flex-1">
                <span class="block truncate">{version.name}</span>
                <span class="text-muted-foreground block font-mono text-[10px]"
                  >{formatDuration(version.totalMinutes)} · {version.itemCount} items</span
                >
              </span>
            </button>
          {/each}
        </div>
        <input
          class="border-border bg-muted/30 mb-2 w-full rounded-md border px-2 py-1.5 text-[12px] outline-none focus:border-[#7aa2f7]"
          placeholder="Sandbox name"
          bind:value={newVersionName}
        />
        <div class="grid grid-cols-2 gap-2">
          <button
            class="rounded-md border border-[#bb9af7]/35 bg-[#bb9af7]/14 px-2 py-1.5 text-[11px] font-semibold text-[#d7c6ff] hover:bg-[#bb9af7]/24"
            on:click={createSandboxVersion}
          >
            Copy sandbox
          </button>
          <button
            class="border-border text-muted-foreground hover:bg-muted hover:text-foreground rounded-md border px-2 py-1.5 text-[11px]"
            on:click={renameActiveVersion}
          >
            Rename
          </button>
        </div>
        {#if week.templateId !== week.defaultTemplateId}
          <button
            class="mt-2 w-full rounded-md border border-red-400/25 px-2 py-1.5 text-[11px] text-red-300 hover:bg-red-500/10"
            on:click={deleteCurrentSandbox}
          >
            Delete current sandbox
          </button>
        {/if}
      </section>

      <section class="border-border border-b p-4">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-[13px] font-semibold">Categories</h2>
          <button class="text-[11px] text-violet-300 hover:text-violet-200"
            >Edit</button
          >
        </div>
        <div
          class="text-muted-foreground mb-2 text-[10px] font-semibold tracking-[0.12em] uppercase"
        >
          Weekly totals
        </div>
        <div class="space-y-2">
          {#each week.categories as category}
            {@const total =
              week.weeklyTotals.find((row) => row.categoryId === category.id)
                ?.minutes ?? 0}
            <div class="flex items-center gap-2 text-[12px]">
              <span
                class="h-3 w-3 rounded-full"
                style="background:{category.color}"
              ></span>
              <span class="flex-1">{category.name}</span>
              <span class="text-muted-foreground font-mono text-[11px]"
                >{formatDuration(total)}</span
              >
            </div>
          {/each}
        </div>
        <div
          class="border-border mt-3 flex items-center justify-between border-t pt-3 text-[12px]"
        >
          <span>Total</span>
          <span class="text-muted-foreground font-mono"
            >{formatDuration(
              week.weeklyTotals.reduce((sum, row) => sum + row.minutes, 0),
            )}</span
          >
        </div>
      </section>

      <section class="border-border border-b p-4">
        <h2 class="mb-3 text-[13px] font-semibold">Daily totals</h2>
        <div class="space-y-1">
          {#each week.dailyTotals as total}
            <button
              class="hover:bg-muted/50 flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[12px] {visibleDay ===
              total.weekday
                ? 'border border-[#7aa2f7]/60 bg-[#7aa2f7]/16 text-[#c0caf5]'
                : 'border border-transparent'}"
              on:click={() => {
                visibleDay = total.weekday;
                dayFocus = true;
              }}
            >
              <span>{week.days[total.weekday - 1].dayName}</span>
              <span class="text-muted-foreground font-mono text-[11px]"
                >{formatDuration(total.minutes)}</span
              >
            </button>
          {/each}
        </div>
      </section>

      <section class="min-h-0 flex-1 overflow-y-auto p-4">
        {#if selected && selectedCategory}
          <div class="mb-4 flex items-center gap-2">
            <span
              class="h-3 w-3 rounded-full"
              style="background:{selectedCategory.color}"
            ></span>
            <h2 class="flex-1 text-[14px] font-semibold">{selected.title}</h2>
            <button
              class="border-border text-muted-foreground hover:text-foreground rounded border p-1"
              on:click={() => (selectedId = null)}><X size={14} /></button
            >
          </div>

          <div class="border-border mb-4 flex border-b text-[12px]">
            <button class="border-b border-[#7aa2f7] px-4 py-2 text-[#7aa2f7]"
              >Details</button
            >
            <button class="text-muted-foreground px-4 py-2">Notes</button>
          </div>

          <div class="space-y-3 text-[12px]">
            <label class="block">
              <span class="text-muted-foreground mb-1 block">Title</span>
              <input
                class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 outline-none focus:border-[#7aa2f7]"
                value={selected.title}
                on:input={(event) =>
                  updateLocalItem(selected.id, {
                    title: event.currentTarget.value,
                  })}
                on:blur={() => persistItem(selected)}
              />
            </label>
            <label class="block">
              <span class="text-muted-foreground mb-1 block">Day</span>
              <select
                class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 outline-none focus:border-[#7aa2f7]"
                value={selected.weekday}
                on:change={(event) => {
                  updateLocalItem(selected.id, {
                    weekday: Number(event.currentTarget.value) as Weekday,
                  });
                  persistItem({
                    ...selected,
                    weekday: Number(event.currentTarget.value) as Weekday,
                  });
                }}
              >
                {#each week.days as day}
                  <option value={day.weekday}>{day.dateLabel}</option>
                {/each}
              </select>
            </label>
            <div class="grid grid-cols-2 gap-2">
              <label class="block">
                <span class="text-muted-foreground mb-1 block">Start</span>
                <input
                  class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 font-mono outline-none focus:border-violet-400"
                  value={formatTime(selected.startMinute)}
                  readonly
                />
              </label>
              {#if selected.kind === "block"}
                <label class="block">
                  <span class="text-muted-foreground mb-1 block">End</span>
                  <input
                    class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 font-mono outline-none focus:border-violet-400"
                    value={formatTime(
                      selected.endMinute ?? selected.startMinute,
                    )}
                    readonly
                  />
                </label>
              {/if}
            </div>
            {#if selected.kind === "block"}
              <label class="block">
                <span class="text-muted-foreground mb-1 block">Duration</span>
                <input
                  class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 font-mono outline-none"
                  value={formatDuration(
                    (selected.endMinute ?? selected.startMinute) -
                      selected.startMinute,
                  )}
                  readonly
                />
              </label>
            {/if}
            <label class="block">
              <span class="text-muted-foreground mb-1 block">Category</span>
              <select
                class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 outline-none focus:border-[#7aa2f7]"
                value={selected.categoryId}
                on:change={(event) => {
                  updateLocalItem(selected.id, {
                    categoryId: event.currentTarget.value,
                  });
                  persistItem({
                    ...selected,
                    categoryId: event.currentTarget.value,
                  });
                }}
              >
                {#each week.categories as category}
                  <option value={category.id}>{category.name}</option>
                {/each}
              </select>
            </label>

            <div>
              <span class="text-muted-foreground mb-2 block">Color</span>
              <div class="flex gap-2">
                {#each week.categories as category}
                  <button
                    class="h-5 w-5 rounded-full border {selected.categoryId ===
                    category.id
                      ? 'border-white ring-2 ring-[#7aa2f7]'
                      : 'border-transparent'}"
                    style="background:{category.color}"
                    title={category.name}
                    on:click={() => {
                      updateLocalItem(selected.id, { categoryId: category.id });
                      persistItem({ ...selected, categoryId: category.id });
                    }}
                  ></button>
                {/each}
              </div>
            </div>

            {#if selected.kind === "pin"}
              <label class="text-muted-foreground flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.completed}
                  on:change={(event) => {
                    updateLocalItem(selected.id, {
                      completed: event.currentTarget.checked,
                    });
                    persistItem({
                      ...selected,
                      completed: event.currentTarget.checked,
                    });
                  }}
                />
                Completed
              </label>
            {/if}

            {#if selectedWarnings.length}
              <div
                class="rounded-md border border-red-400/50 bg-red-500/12 p-3 text-red-100"
              >
                <div class="mb-1 flex items-center gap-2 font-semibold">
                  <Clock3 size={14} /> Overlap
                </div>
                <div class="text-[11px] text-red-100/75">
                  Overlaps with {selectedWarnings[0].otherTitle}
                </div>
              </div>
            {/if}

            <div class="flex gap-2 pt-2">
              <button
                class="flex items-center gap-1 rounded-md border border-red-400/30 px-3 py-2 text-red-300 hover:bg-red-500/10"
                on:click={deleteSelected}
              >
                <Trash2 size={14} /> Delete
              </button>
              <button
                class="border-border text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-1 rounded-md border px-3 py-2"
                on:click={duplicateSelected}
              >
                <Copy size={14} /> Duplicate
              </button>
              <button
                class="ml-auto rounded-md bg-[#7aa2f7] px-4 py-2 font-semibold text-[#101014] hover:bg-[#9eceff]"
                on:click={() => (selectedId = null)}>Done</button
              >
            </div>
          </div>
        {:else}
          <div
            class="border-border text-muted-foreground rounded-md border border-dashed p-4 text-[12px]"
          >
            Select a block or pin to edit its details.
          </div>
        {/if}
      </section>
    </aside>
  </main>

  <footer
    class="border-border bg-surface text-muted-foreground flex h-10 shrink-0 items-center gap-5 border-t px-4 text-[12px]"
  >
    <span class="inline-flex items-center gap-2"
      ><span class="h-2.5 w-2.5 rounded-full bg-[#9ece6a]"></span>Local only</span
    >
    <Tooltip.Provider delayDuration={250}>
      <Tooltip.Root>
        <Tooltip.Trigger
          class="hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-2 rounded-sm outline-none focus-visible:ring-2"
        >
          <Database size={14} />SQLite
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            class="border-border bg-popover text-popover-foreground z-50 rounded-md border px-3 py-2 text-[12px] shadow-xl"
          >
            Runtime data stays in ignored local SQLite files.
            <Tooltip.Arrow class="fill-popover" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
    <span class="mx-auto">5-minute grid · {zoomPercent()}% zoom</span>
    <span>All data is stored locally on this device.</span>
  </footer>
</div>

{#if dialogOpen}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
    aria-label="Close add item dialog"
    on:click={() => (dialogOpen = false)}
  ></button>
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Add schedule item"
    class="border-border bg-surface fixed top-1/2 left-1/2 z-50 w-[420px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border p-5 shadow-2xl"
  >
    <h2 class="text-[15px] font-semibold">
      Add {dialogKind === "pin" ? "pin" : "block"}
    </h2>
    <div class="mt-4 space-y-3 text-[12px]">
      <label class="block">
        <span class="text-muted-foreground mb-1 block">Title</span>
        <input
          class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 outline-none focus:border-[#7aa2f7]"
          bind:value={draft.title}
        />
      </label>
      <div class="grid grid-cols-2 gap-2">
        <label class="block">
          <span class="text-muted-foreground mb-1 block">Day</span>
          <select
            class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 outline-none"
            bind:value={draft.weekday}
          >
            {#each week.days as day}
              <option value={day.weekday}>{day.dateLabel}</option>
            {/each}
          </select>
        </label>
        <label class="block">
          <span class="text-muted-foreground mb-1 block">Start minute</span>
          <input
            class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 outline-none"
            type="number"
            step={SNAP_MINUTES}
            bind:value={draft.startMinute}
          />
        </label>
      </div>
      {#if dialogKind === "block"}
        <label class="block">
          <span class="text-muted-foreground mb-1 block">End minute</span>
          <input
            class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 outline-none"
            type="number"
            step={SNAP_MINUTES}
            bind:value={draft.endMinute}
          />
        </label>
      {/if}
      <label class="block">
        <span class="text-muted-foreground mb-1 block">Category</span>
        <select
          class="border-border bg-muted/30 w-full rounded-md border px-2 py-1.5 outline-none"
          bind:value={draft.categoryId}
        >
          {#each week.categories as category}
            <option value={category.id}>{category.name}</option>
          {/each}
        </select>
      </label>
    </div>
    <div class="mt-5 flex justify-end gap-2">
      <button
        class="border-border text-muted-foreground hover:bg-muted rounded-md border px-3 py-2 text-[12px]"
        on:click={() => (dialogOpen = false)}>Cancel</button
      >
      <button
        class="rounded-md bg-[#7aa2f7] px-3 py-2 text-[12px] font-semibold text-[#101014] hover:bg-[#9eceff]"
        on:click={createItem}>Create</button
      >
    </div>
  </div>
{/if}

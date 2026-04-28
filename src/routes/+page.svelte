<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { Tooltip } from "bits-ui";
  import { untrack } from "svelte";
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
  } from "lucide-svelte";
  import { formatDuration, formatTime, snapMinute } from "$lib/schedule";
  import type { Category, ItemInput, OverlapWarning, ScheduleItem, WeekView, Weekday } from "$lib/types";

  let { data } = $props<{ data: { week: WeekView } }>();

  const HOUR_HEIGHT = 128;
  const PIN_HEIGHT = 28;
  const MIN_BLOCK_HEIGHT = 18;

  // svelte-ignore state_referenced_locally -- local planner state is resynced from loader data below after mutations.
  let week = $state<WeekView>(data.week);
  let selectedId = $state<string | null>(null);
  let dialogOpen = $state(false);
  let dialogKind = $state<"block" | "pin">("block");
  let draft = $state<ItemInput>(newDraft("block", 1, 9 * 60));
  let dayFocus = $state(false);
  let visibleDay = $state<Weekday>(4);
  let newVersionName = $state("");
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
      const incomingItems = incoming.days.flatMap((day: WeekView["days"][number]) => day.items);
      if (selectedId && !incomingItems.some((item: ScheduleItem) => item.id === selectedId)) selectedId = null;
    });
  });

  const selected = $derived(allItems().find((item: ScheduleItem) => item.id === selectedId) ?? null);
  const selectedCategory = $derived(selected ? categoryById(selected.categoryId) : null);
  const selectedWarnings = $derived(selected ? week.overlapWarnings.filter((warning: OverlapWarning) => warning.itemId === selected.id) : []);
  const maxStart = $derived(Math.min(...week.days.map((day) => day.bounds.wakeMinute - day.bounds.bufferBefore)));
  const maxEnd = $derived(Math.max(...week.days.map((day) => day.bounds.sleepMinute + day.bounds.bufferAfter)));
  const totalGridMinutes = $derived(maxEnd - maxStart);
  const displayedDays = $derived(dayFocus ? week.days.filter((day) => day.weekday === visibleDay) : week.days);

  function allItems(): ScheduleItem[] {
    return week.days.flatMap((day) => day.items);
  }

  function categoryById(id: string): Category {
    return week.categories.find((category) => category.id === id) ?? week.categories[0];
  }

  function warningsFor(id: string): OverlapWarning[] {
    return week.overlapWarnings.filter((warning: OverlapWarning) => warning.itemId === id);
  }

  function newDraft(kind: "block" | "pin", weekday: Weekday, startMinute: number): ItemInput {
    return {
      kind,
      title: kind === "pin" ? "Start laundry" : "Deep work",
      weekday,
      startMinute,
      endMinute: kind === "pin" ? null : startMinute + 60,
      categoryId: week?.categories?.[0]?.id ?? "deep-work",
      notes: "",
      completed: false,
    };
  }

  function openCreate(kind: "block" | "pin", weekday: Weekday = visibleDay, startMinute = 9 * 60) {
    dialogKind = kind;
    draft = newDraft(kind, weekday, startMinute);
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
      endMinute: selected.endMinute ? snapMinute(selected.endMinute + 30) : null,
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
    const height =
      item.kind === "pin"
        ? PIN_HEIGHT
        : Math.max(MIN_BLOCK_HEIGHT, (((item.endMinute ?? item.startMinute + 15) - item.startMinute) / 60) * HOUR_HEIGHT);
    return `top:${top}%;height:${item.kind === "pin" ? `${PIN_HEIGHT}px` : `${height}px`};`;
  }

  function itemDuration(item: ScheduleItem) {
    return (item.endMinute ?? item.startMinute) - item.startMinute;
  }

  function itemDensity(item: ScheduleItem) {
    if (item.kind === "pin") return "pin";
    const duration = itemDuration(item);
    if (duration <= 15) return "micro";
    if (duration < 45) return "compact";
    return "normal";
  }

  function hourTicks() {
    const ticks: number[] = [];
    for (let minute = Math.ceil(maxStart / 60) * 60; minute <= maxEnd; minute += 60) ticks.push(minute);
    return ticks;
  }

  function tickStyle(minute: number) {
    return `top:${((minute - maxStart) / totalGridMinutes) * 100}%`;
  }

  function boundsStyle(startMinute: number, endMinute: number) {
    return `top:${((startMinute - maxStart) / totalGridMinutes) * 100}%;height:${((endMinute - startMinute) / totalGridMinutes) * 100}%`;
  }

  function beginDrag(event: PointerEvent, item: ScheduleItem, mode: "move" | "resize-start" | "resize-end") {
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
    const item = allItems().find((candidate: ScheduleItem) => candidate.id === dragging?.id);
    if (!item) return;
    const deltaMinutes = snapMinute(((event.clientY - dragging.originY) / HOUR_HEIGHT) * 60);
    let startMinute = dragging.originStart;
    let endMinute = dragging.originEnd;

    if (dragging.mode === "move") {
      startMinute = snapMinute(dragging.originStart + deltaMinutes);
      endMinute = dragging.originEnd === null ? null : snapMinute(dragging.originEnd + deltaMinutes);
    } else if (dragging.mode === "resize-start") {
      startMinute = Math.min(snapMinute(dragging.originStart + deltaMinutes), (dragging.originEnd ?? dragging.originStart + 15) - 15);
    } else if (dragging.mode === "resize-end") {
      endMinute = Math.max(snapMinute((dragging.originEnd ?? dragging.originStart + 60) + deltaMinutes), dragging.originStart + 15);
    }

    updateLocalItem(item.id, { startMinute, endMinute });
  }

  async function endDrag() {
    if (!dragging) return;
    const item = allItems().find((candidate: ScheduleItem) => candidate.id === dragging?.id);
    dragging = null;
    if (item) await persistItem(item);
  }

  function updateLocalItem(id: string, patch: Partial<ScheduleItem>) {
    week = {
      ...week,
      days: week.days.map((day) => ({
        ...day,
        items: day.items.map((item: ScheduleItem) => (item.id === id ? { ...item, ...patch } : item)),
      })),
    };
  }

  function dateRangeLabel() {
    const start = new Date(`${week.weekStart}T00:00:00`);
    const end = new Date(`${week.weekEnd}T00:00:00`);
    return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }
</script>

<div class="flex h-screen flex-col overflow-hidden bg-background text-foreground">
  <header class="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 shadow-[0_1px_0_rgba(255,255,255,0.03)]">
    <div class="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/50">
      <CalendarDays size={17} class="text-muted-foreground" />
    </div>
    <h1 class="mr-4 text-[18px] font-semibold tracking-tight">Schedule Studio</h1>

    <button class="h-8 rounded-md border border-border bg-muted/35 px-3 text-[12px] font-medium text-foreground/90 hover:bg-muted">
      {week.templateName}
    </button>
    <button class="ml-2 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" title="Previous week"><ChevronLeft size={16} /></button>
    <button class="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" title="Next week"><ChevronRight size={16} /></button>
    <div class="h-6 w-px bg-border"></div>
    <div class="flex items-center gap-2 text-[13px] text-foreground/90">
      <CalendarDays size={15} class="text-muted-foreground" />
      <span>{dateRangeLabel()}</span>
    </div>

    <div class="ml-auto flex items-center gap-2">
      <button class="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" title="Undo"><Undo2 size={15} /></button>
      <button class="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" title="Settings"><Settings size={15} /></button>
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
      <div class="mx-2 h-6 w-px bg-border"></div>
      <label class="flex h-8 items-center gap-2 rounded-md border border-border bg-muted/30 px-3 text-[12px] text-muted-foreground has-checked:border-[#7aa2f7]/60 has-checked:text-[#c0caf5]">
        Day focus
        <input class="sr-only" type="checkbox" bind:checked={dayFocus} />
        <span class="flex h-4 w-4 items-center justify-center rounded-full border border-border bg-surface-2">
          {#if dayFocus}<Check size={11} />{/if}
        </span>
      </label>
      <button class="rounded-md border border-border bg-muted/30 p-2 text-muted-foreground hover:text-foreground" title="Grid"><Grid2X2 size={16} /></button>
      <button class="rounded-md border border-border bg-muted/30 p-2 text-muted-foreground hover:text-foreground" title="More"><MoreVertical size={16} /></button>
    </div>
  </header>

  <main class="flex min-h-0 flex-1">
    <section class="flex min-w-0 flex-1 flex-col">
      <div class="grid h-10 shrink-0 border-b border-border bg-surface-2/70" style="grid-template-columns: 80px repeat({displayedDays.length}, minmax(150px, 1fr));">
        <div class="flex items-center px-4 text-[12px] text-muted-foreground">All times</div>
        {#each displayedDays as day}
          <button
            class="border-l border-border px-3 text-left transition-colors hover:bg-muted/30 {day.weekday === visibleDay ? 'text-[#bb9af7]' : ''}"
            on:click={() => (visibleDay = day.weekday)}
          >
            <div class="text-[14px] font-semibold">{day.dateLabel}</div>
            <div class="mt-0.5 flex gap-4 text-[10px] text-muted-foreground">
              <span>Wake {formatTime(day.bounds.wakeMinute).replace(":00 ", " ")}</span>
              <span>Sleep {formatTime(day.bounds.sleepMinute).replace(":00 ", " ")}</span>
            </div>
          </button>
        {/each}
      </div>

      <div class="relative min-h-0 flex-1 overflow-auto">
        <div
          class="relative grid min-h-[980px]"
          style="grid-template-columns: 80px repeat({displayedDays.length}, minmax(150px, 1fr)); height: {(totalGridMinutes / 60) * HOUR_HEIGHT}px;"
        >
          <div class="relative border-r border-border bg-surface/70">
            {#each hourTicks() as tick}
              <div class="absolute left-0 right-0 -translate-y-2 px-4 text-[12px] text-muted-foreground" style={tickStyle(tick)}>
                {formatTime(tick).replace(":00", "")}
              </div>
            {/each}
          </div>

          {#each displayedDays as day}
            <div class="relative border-r border-border/80 bg-[#11131f]">
              {#each hourTicks() as tick}
                <div class="absolute left-0 right-0 border-t border-dashed border-white/[0.055]" style={tickStyle(tick)}></div>
              {/each}
              <div class="absolute left-0 right-0 bg-sky-300/[0.055]" style={boundsStyle(day.bounds.wakeMinute - day.bounds.bufferBefore, day.bounds.wakeMinute)}>
                <span class="px-3 py-1 text-[10px] text-sky-200/60">Buffer</span>
              </div>
              <div class="absolute left-0 right-0 bg-slate-300/[0.045]" style={boundsStyle(day.bounds.sleepMinute, day.bounds.sleepMinute + day.bounds.bufferAfter)}>
                <span class="px-3 py-1 text-[10px] text-slate-200/60">Buffer</span>
              </div>
              <div class="absolute left-0 right-0 border-t border-sky-300/20 bg-sky-300/[0.035]" style={boundsStyle(day.bounds.wakeMinute, day.bounds.wakeMinute + 30)}>
                <span class="px-3 py-1 text-[10px] text-sky-100/55">Wake</span>
              </div>
              <div class="absolute left-0 right-0 border-t border-slate-200/15 bg-slate-300/[0.04]" style={boundsStyle(day.bounds.sleepMinute - 30, day.bounds.sleepMinute)}>
                <span class="px-3 py-1 text-[10px] text-slate-100/55">Sleep</span>
              </div>

              {#each day.items as item}
                {@const category = categoryById(item.categoryId)}
                {@const itemWarnings = warningsFor(item.id)}
                {@const density = itemDensity(item)}
                <button
                  class="absolute left-3 right-3 z-10 overflow-hidden rounded-md border text-left shadow-lg shadow-black/20 transition-transform hover:translate-y-[-1px] focus:outline-none focus:ring-2 focus:ring-ring {selectedId === item.id ? 'ring-2 ring-[#7aa2f7]/80' : ''} {density === 'pin' ? 'flex items-center gap-2 bg-transparent px-2 !shadow-none' : ''} {density === 'micro' ? 'px-2 py-0.5' : ''} {density === 'compact' ? 'px-2 py-1' : ''} {density === 'normal' ? 'px-3 py-2' : ''}"
                  style="{itemStyle(item)} border-color: {category.color}; background: {item.kind === 'pin' ? 'transparent' : `linear-gradient(135deg, ${category.color}42, ${category.color}1a)`};"
                  on:click={() => (selectedId = item.id)}
                  on:pointermove={moveDrag}
                  on:pointerup={endDrag}
                  on:pointercancel={endDrag}
                >
                  {#if item.kind === "block"}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <span
                      class="absolute left-1/2 top-0 h-2 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-full border border-white/60 bg-white/80 {selectedId === item.id ? '' : 'hidden'}"
                      on:pointerdown={(event) => beginDrag(event, item, "resize-start")}
                    ></span>
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <span
                      class="absolute bottom-0 left-1/2 h-2 w-10 -translate-x-1/2 translate-y-1/2 cursor-ns-resize rounded-full border border-white/60 bg-white/80 {selectedId === item.id ? '' : 'hidden'}"
                      on:pointerdown={(event) => beginDrag(event, item, "resize-end")}
                    ></span>
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <span class="absolute inset-0 cursor-grab" on:pointerdown={(event) => beginDrag(event, item, "move")}></span>
                    {#if density === "micro"}
                      <span class="relative block truncate text-[11px] font-semibold leading-[16px]" title={`${item.title}: ${formatTime(item.startMinute)} - ${formatTime(item.endMinute ?? item.startMinute)}`}>
                        {item.title}
                      </span>
                    {:else}
                      <span class="relative block truncate text-[12px] font-semibold leading-[17px]">{item.title}</span>
                      <span class="relative mt-0.5 block truncate text-[11px] leading-[14px] text-foreground/70">
                        {formatTime(item.startMinute).replace(" AM", "").replace(" PM", "")} - {formatTime(item.endMinute ?? item.startMinute).replace(" AM", "").replace(" PM", "")}
                      </span>
                    {/if}
                    {#if itemWarnings.length}
                      <span class="relative mt-1 inline-flex rounded bg-red-500/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">Overlap</span>
                    {/if}
                  {:else}
                    <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:{category.color}"></span>
                    <span class="truncate text-[11px] text-foreground/75">{item.title}</span>
                    <span class="ml-auto flex h-3.5 w-3.5 items-center justify-center rounded border border-muted-foreground/60 text-[9px]">
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

    <aside class="flex w-[286px] shrink-0 flex-col border-l border-border bg-surface">
      <section class="border-b border-border p-4">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-[13px] font-semibold">Schedule versions</h2>
          <span class="rounded border border-[#7aa2f7]/30 px-1.5 py-0.5 text-[10px] text-[#a9c3ff]">Active</span>
        </div>
        <div class="mb-3 space-y-1">
          {#each week.versions as version}
            <button
              class="flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left text-[12px] {version.isActive ? 'border-[#7aa2f7]/60 bg-[#7aa2f7]/14 text-[#c0caf5]' : 'border-transparent hover:bg-muted/45'}"
              on:click={() => activateVersion(version.id)}
              title={version.isDefault ? "Default schedule" : "Sandbox schedule"}
            >
              <span class="h-2.5 w-2.5 rounded-full {version.isDefault ? 'bg-[#9ece6a]' : 'bg-[#bb9af7]'}"></span>
              <span class="min-w-0 flex-1">
                <span class="block truncate">{version.name}</span>
                <span class="block font-mono text-[10px] text-muted-foreground">{formatDuration(version.totalMinutes)} · {version.itemCount} items</span>
              </span>
            </button>
          {/each}
        </div>
        <input
          class="mb-2 w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[12px] outline-none focus:border-[#7aa2f7]"
          placeholder="Sandbox name"
          bind:value={newVersionName}
        />
        <div class="grid grid-cols-2 gap-2">
          <button class="rounded-md border border-[#bb9af7]/35 bg-[#bb9af7]/14 px-2 py-1.5 text-[11px] font-semibold text-[#d7c6ff] hover:bg-[#bb9af7]/24" on:click={createSandboxVersion}>
            Copy sandbox
          </button>
          <button class="rounded-md border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground" on:click={renameActiveVersion}>
            Rename
          </button>
        </div>
        {#if week.templateId !== week.defaultTemplateId}
          <button class="mt-2 w-full rounded-md border border-red-400/25 px-2 py-1.5 text-[11px] text-red-300 hover:bg-red-500/10" on:click={deleteCurrentSandbox}>
            Delete current sandbox
          </button>
        {/if}
      </section>

      <section class="border-b border-border p-4">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-[13px] font-semibold">Categories</h2>
          <button class="text-[11px] text-violet-300 hover:text-violet-200">Edit</button>
        </div>
        <div class="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Weekly totals</div>
        <div class="space-y-2">
          {#each week.categories as category}
            {@const total = week.weeklyTotals.find((row) => row.categoryId === category.id)?.minutes ?? 0}
            <div class="flex items-center gap-2 text-[12px]">
              <span class="h-3 w-3 rounded-full" style="background:{category.color}"></span>
              <span class="flex-1">{category.name}</span>
              <span class="font-mono text-[11px] text-muted-foreground">{formatDuration(total)}</span>
            </div>
          {/each}
        </div>
        <div class="mt-3 flex items-center justify-between border-t border-border pt-3 text-[12px]">
          <span>Total</span>
          <span class="font-mono text-muted-foreground">{formatDuration(week.weeklyTotals.reduce((sum, row) => sum + row.minutes, 0))}</span>
        </div>
      </section>

      <section class="border-b border-border p-4">
        <h2 class="mb-3 text-[13px] font-semibold">Daily totals</h2>
        <div class="space-y-1">
          {#each week.dailyTotals as total}
            <button
              class="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[12px] hover:bg-muted/50 {visibleDay === total.weekday ? 'border border-[#7aa2f7]/60 bg-[#7aa2f7]/16 text-[#c0caf5]' : 'border border-transparent'}"
              on:click={() => {
                visibleDay = total.weekday;
                dayFocus = true;
              }}
            >
              <span>{week.days[total.weekday - 1].dayName}</span>
              <span class="font-mono text-[11px] text-muted-foreground">{formatDuration(total.minutes)}</span>
            </button>
          {/each}
        </div>
      </section>

      <section class="min-h-0 flex-1 overflow-y-auto p-4">
        {#if selected && selectedCategory}
          <div class="mb-4 flex items-center gap-2">
            <span class="h-3 w-3 rounded-full" style="background:{selectedCategory.color}"></span>
            <h2 class="flex-1 text-[14px] font-semibold">{selected.title}</h2>
            <button class="rounded border border-border p-1 text-muted-foreground hover:text-foreground" on:click={() => (selectedId = null)}><X size={14} /></button>
          </div>

          <div class="mb-4 flex border-b border-border text-[12px]">
            <button class="border-b border-[#7aa2f7] px-4 py-2 text-[#7aa2f7]">Details</button>
            <button class="px-4 py-2 text-muted-foreground">Notes</button>
          </div>

          <div class="space-y-3 text-[12px]">
            <label class="block">
              <span class="mb-1 block text-muted-foreground">Title</span>
              <input
                class="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 outline-none focus:border-[#7aa2f7]"
                value={selected.title}
                on:input={(event) => updateLocalItem(selected.id, { title: event.currentTarget.value })}
                on:blur={() => persistItem(selected)}
              />
            </label>
            <label class="block">
              <span class="mb-1 block text-muted-foreground">Day</span>
              <select
                class="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 outline-none focus:border-[#7aa2f7]"
                value={selected.weekday}
                on:change={(event) => {
                  updateLocalItem(selected.id, { weekday: Number(event.currentTarget.value) as Weekday });
                  persistItem({ ...selected, weekday: Number(event.currentTarget.value) as Weekday });
                }}
              >
                {#each week.days as day}
                  <option value={day.weekday}>{day.dateLabel}</option>
                {/each}
              </select>
            </label>
            <div class="grid grid-cols-2 gap-2">
              <label class="block">
                <span class="mb-1 block text-muted-foreground">Start</span>
                <input
                  class="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 font-mono outline-none focus:border-violet-400"
                  value={formatTime(selected.startMinute)}
                  readonly
                />
              </label>
              {#if selected.kind === "block"}
                <label class="block">
                  <span class="mb-1 block text-muted-foreground">End</span>
                  <input
                    class="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 font-mono outline-none focus:border-violet-400"
                    value={formatTime(selected.endMinute ?? selected.startMinute)}
                    readonly
                  />
                </label>
              {/if}
            </div>
            {#if selected.kind === "block"}
              <label class="block">
                <span class="mb-1 block text-muted-foreground">Duration</span>
                <input
                  class="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 font-mono outline-none"
                  value={formatDuration((selected.endMinute ?? selected.startMinute) - selected.startMinute)}
                  readonly
                />
              </label>
            {/if}
            <label class="block">
              <span class="mb-1 block text-muted-foreground">Category</span>
              <select
                class="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 outline-none focus:border-[#7aa2f7]"
                value={selected.categoryId}
                on:change={(event) => {
                  updateLocalItem(selected.id, { categoryId: event.currentTarget.value });
                  persistItem({ ...selected, categoryId: event.currentTarget.value });
                }}
              >
                {#each week.categories as category}
                  <option value={category.id}>{category.name}</option>
                {/each}
              </select>
            </label>

            <div>
              <span class="mb-2 block text-muted-foreground">Color</span>
              <div class="flex gap-2">
                {#each week.categories as category}
                  <button
                    class="h-5 w-5 rounded-full border {selected.categoryId === category.id ? 'border-white ring-2 ring-[#7aa2f7]' : 'border-transparent'}"
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
              <label class="flex items-center gap-2 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={selected.completed}
                  on:change={(event) => {
                    updateLocalItem(selected.id, { completed: event.currentTarget.checked });
                    persistItem({ ...selected, completed: event.currentTarget.checked });
                  }}
                />
                Completed
              </label>
            {/if}

            {#if selectedWarnings.length}
              <div class="rounded-md border border-red-400/50 bg-red-500/12 p-3 text-red-100">
                <div class="mb-1 flex items-center gap-2 font-semibold"><Clock3 size={14} /> Overlap</div>
                <div class="text-[11px] text-red-100/75">Overlaps with {selectedWarnings[0].otherTitle}</div>
              </div>
            {/if}

            <div class="flex gap-2 pt-2">
              <button class="flex items-center gap-1 rounded-md border border-red-400/30 px-3 py-2 text-red-300 hover:bg-red-500/10" on:click={deleteSelected}>
                <Trash2 size={14} /> Delete
              </button>
              <button class="flex items-center gap-1 rounded-md border border-border px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground" on:click={duplicateSelected}>
                <Copy size={14} /> Duplicate
              </button>
              <button class="ml-auto rounded-md bg-[#7aa2f7] px-4 py-2 font-semibold text-[#101014] hover:bg-[#9eceff]" on:click={() => (selectedId = null)}>Done</button>
            </div>
          </div>
        {:else}
          <div class="rounded-md border border-dashed border-border p-4 text-[12px] text-muted-foreground">
            Select a block or pin to edit its details.
          </div>
        {/if}
      </section>
    </aside>
  </main>

  <footer class="flex h-10 shrink-0 items-center gap-5 border-t border-border bg-surface px-4 text-[12px] text-muted-foreground">
    <span class="inline-flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full bg-[#9ece6a]"></span>Local only</span>
    <Tooltip.Provider delayDuration={250}>
      <Tooltip.Root>
        <Tooltip.Trigger class="inline-flex items-center gap-2 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <Database size={14} />SQLite
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content side="top" class="z-50 rounded-md border border-border bg-popover px-3 py-2 text-[12px] text-popover-foreground shadow-xl">
            Runtime data stays in ignored local SQLite files.
            <Tooltip.Arrow class="fill-popover" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
    <span class="mx-auto">15-minute grid</span>
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
    class="fixed left-1/2 top-1/2 z-50 w-[420px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-5 shadow-2xl"
  >
      <h2 class="text-[15px] font-semibold">Add {dialogKind === "pin" ? "pin" : "block"}</h2>
      <div class="mt-4 space-y-3 text-[12px]">
        <label class="block">
          <span class="mb-1 block text-muted-foreground">Title</span>
          <input class="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 outline-none focus:border-[#7aa2f7]" bind:value={draft.title} />
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="block">
            <span class="mb-1 block text-muted-foreground">Day</span>
            <select class="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 outline-none" bind:value={draft.weekday}>
              {#each week.days as day}
                <option value={day.weekday}>{day.dateLabel}</option>
              {/each}
            </select>
          </label>
          <label class="block">
            <span class="mb-1 block text-muted-foreground">Start minute</span>
            <input class="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 outline-none" type="number" step="15" bind:value={draft.startMinute} />
          </label>
        </div>
        {#if dialogKind === "block"}
          <label class="block">
            <span class="mb-1 block text-muted-foreground">End minute</span>
            <input class="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 outline-none" type="number" step="15" bind:value={draft.endMinute} />
          </label>
        {/if}
        <label class="block">
          <span class="mb-1 block text-muted-foreground">Category</span>
          <select class="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 outline-none" bind:value={draft.categoryId}>
            {#each week.categories as category}
              <option value={category.id}>{category.name}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button class="rounded-md border border-border px-3 py-2 text-[12px] text-muted-foreground hover:bg-muted" on:click={() => (dialogOpen = false)}>Cancel</button>
        <button class="rounded-md bg-[#7aa2f7] px-3 py-2 text-[12px] font-semibold text-[#101014] hover:bg-[#9eceff]" on:click={createItem}>Create</button>
      </div>
  </div>
{/if}

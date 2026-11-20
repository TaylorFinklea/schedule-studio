<script lang="ts">
  import { X } from "lucide-svelte";
  import { onMount } from "svelte";
  import { calculateDailyCategoryTotals, formatDuration } from "$lib/schedule";
  import type { Category, WeekView } from "$lib/types";

  type Day = WeekView["days"][number];
  type Props = {
    day: Day;
    categories: Category[];
    onClose: () => void;
  };

  let { day, categories, onClose }: Props = $props();
  let closeButton: HTMLButtonElement;
  let summaryBody: HTMLDivElement;

  onMount(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButton.focus();
    return () => previouslyFocused?.focus();
  });

  const totals = $derived(
    calculateDailyCategoryTotals(day.items, categories, day.weekday),
  );

  const parentGroups = $derived.by(() => {
    const grouped = totals
      .filter((total) => total.parentId === null)
      .map((parent) => ({
        total: parent,
        category: categories.find(
          (category) => category.id === parent.categoryId,
        )!,
        children: totals
          .filter((child) => child.parentId === parent.categoryId)
          .map((child) => ({
            total: child,
            category: categories.find(
              (category) => category.id === child.categoryId,
            )!,
          })),
      }));

    // Defensive fallback for any legacy/orphaned subcategory rows.
    const placed = new Set(
      grouped.flatMap((group) => [
        group.total.categoryId,
        ...group.children.map((child) => child.total.categoryId),
      ]),
    );
    for (const total of totals) {
      if (placed.has(total.categoryId)) continue;
      const category = categories.find(
        (entry) => entry.id === total.categoryId,
      );
      if (category) {
        grouped.push({ total, category, children: [] });
      }
    }
    return grouped;
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
  role="presentation"
  onclick={onClose}
>
  <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
  <section
    class="border-border bg-surface flex max-h-[min(80vh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border shadow-2xl shadow-black/50"
    role="dialog"
    aria-modal="true"
    aria-labelledby="day-category-summary-title"
    aria-describedby="day-category-summary-description"
    tabindex="-1"
    onclick={(event) => event.stopPropagation()}
    onkeydown={(event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        event.preventDefault();
        if (document.activeElement === closeButton) {
          summaryBody.focus();
        } else {
          closeButton.focus();
        }
      }
    }}
  >
    <header
      class="border-border flex items-start justify-between border-b px-5 py-4"
    >
      <div>
        <h2
          id="day-category-summary-title"
          class="text-foreground text-[15px] font-semibold tracking-tight"
        >
          {day.dateLabel} scheduled time
        </h2>
        <p
          id="day-category-summary-description"
          class="text-muted-foreground mt-1 text-[11px]"
        >
          Saved block and pin durations by category. Parent totals include their
          subcategories.
        </p>
      </div>
      <button
        type="button"
        class="text-muted-foreground hover:bg-muted hover:text-foreground -mt-1 -mr-1 rounded p-1.5"
        aria-label="Close scheduled time summary"
        bind:this={closeButton}
        onclick={onClose}
      >
        <X size={15} />
      </button>
    </header>

    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 focus-visible:ring-2 focus-visible:ring-[#7aa2f7] focus-visible:outline-none focus-visible:ring-inset"
      tabindex="0"
      aria-label="Scheduled time by category"
      bind:this={summaryBody}
    >
      {#if parentGroups.length === 0}
        <p class="text-muted-foreground py-6 text-center text-[12px]">
          No categories yet.
        </p>
      {:else}
        {#each parentGroups as group (group.total.categoryId)}
          <section
            class="border-border/70 border-b pb-4 last:border-0 last:pb-0"
            aria-label={group.category.name}
          >
            <div class="flex items-center gap-2">
              <span
                class="h-2 w-2 shrink-0 rounded-full"
                style="background-color:{group.category.color};"
                aria-hidden="true"
              ></span>
              <h3
                class="text-foreground min-w-0 flex-1 truncate text-[13px] font-semibold"
              >
                {group.category.name}
              </h3>
              <span
                class="text-foreground text-[13px] font-semibold tabular-nums"
              >
                {formatDuration(group.total.rolledUpActualMinutes)}
              </span>
            </div>
            {#if group.children.length > 0}
              <div class="border-border/60 mt-2 ml-1 space-y-2 border-l pl-4">
                <div
                  class="text-muted-foreground flex items-center justify-between gap-3 text-[11px]"
                >
                  <span class="truncate">{group.category.name} direct</span>
                  <span class="tabular-nums"
                    >{formatDuration(group.total.actualMinutes)}</span
                  >
                </div>
                {#each group.children as child (child.total.categoryId)}
                  <div
                    class="flex items-center justify-between gap-3 text-[11px]"
                  >
                    <span
                      class="text-muted-foreground flex min-w-0 items-center gap-2 truncate"
                    >
                      <span
                        class="h-1.5 w-1.5 shrink-0 rounded-full"
                        style="background-color:{child.category.color};"
                        aria-hidden="true"
                      ></span>
                      <span class="truncate">{child.category.name}</span>
                    </span>
                    <span class="text-foreground tabular-nums">
                      {formatDuration(child.total.actualMinutes)}
                    </span>
                  </div>
                {/each}
              </div>
            {/if}
          </section>
        {/each}
      {/if}
    </div>
  </section>
</div>

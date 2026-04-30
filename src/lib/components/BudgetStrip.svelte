<script lang="ts">
  import type { Category, CategoryBudget } from "$lib/types";
  import { formatDuration } from "$lib/schedule";

  type Props = {
    categories: Category[];
    budgets: CategoryBudget[];
  };

  let { categories, budgets }: Props = $props();

  const visibleBudgets = $derived(
    budgets.filter((budget) =>
      categories.some(
        (category) => category.id === budget.categoryId && !category.archived,
      ),
    ),
  );

  function categoryFor(id: string): Category | undefined {
    return categories.find((category) => category.id === id);
  }

  function deltaText(budget: CategoryBudget): string {
    if (budget.deltaMinutes === null) return "observe";
    if (budget.deltaMinutes === 0) return "on target";
    const sign = budget.deltaMinutes < 0 ? "−" : "+";
    return `${sign}${formatDuration(Math.abs(budget.deltaMinutes))}`;
  }

  function deltaTone(
    budget: CategoryBudget,
  ): "muted" | "ok" | "warn" | "alert" {
    if (budget.deltaMinutes === null) return "muted";
    if (budget.mode === "minimum") {
      return budget.deltaMinutes >= 0 ? "ok" : "warn";
    }
    if (Math.abs(budget.deltaMinutes) <= 30) return "ok";
    return budget.deltaMinutes < 0 ? "warn" : "alert";
  }

  const totals = $derived.by(() => {
    let targeted = 0;
    let actualOfTargeted = 0;
    for (const budget of visibleBudgets) {
      if (budget.targetMinutes !== null && budget.mode !== "observation") {
        targeted += budget.targetMinutes;
        actualOfTargeted += budget.actualMinutes;
      }
    }
    return { targeted, actualOfTargeted };
  });
</script>

<div
  class="border-border bg-surface/60 flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b px-4 text-[12px]"
  aria-label="Weekly budget summary"
>
  {#each visibleBudgets as budget (budget.categoryId)}
    {@const category = categoryFor(budget.categoryId)}
    {#if category}
      {@const tone = deltaTone(budget)}
      <span
        class="border-border bg-surface-2/60 hover:bg-surface-2 flex flex-none items-center gap-2 rounded-full border px-3 py-1 transition-colors"
        title="{category.name}: {formatDuration(
          budget.actualMinutes,
        )}{budget.targetMinutes !== null
          ? ` of ${formatDuration(budget.targetMinutes)} ${budget.mode}`
          : ' (observed)'}"
        data-testid="budget-pill-{budget.categoryId}"
      >
        <span
          class="block h-1.5 w-1.5 rounded-full"
          style="background-color: {category.color};"
          aria-hidden="true"
        ></span>
        <span class="text-foreground font-medium">{category.name}</span>
        <span class="text-muted-foreground tabular-nums">
          {formatDuration(budget.actualMinutes)}{#if budget.targetMinutes !== null}
            <span class="text-muted-foreground/60">
              / {formatDuration(budget.targetMinutes)}</span
            >
          {/if}
        </span>
        {#if budget.mode !== "observation" && budget.deltaMinutes !== null}
          <span
            class="tabular-nums {tone === 'ok'
              ? 'text-[#9ece6a]'
              : tone === 'warn'
                ? 'text-[#e0af68]'
                : 'text-[#f7768e]'}"
          >
            {deltaText(budget)}
          </span>
        {/if}
      </span>
    {/if}
  {/each}

  {#if totals.targeted > 0}
    <span class="text-muted-foreground ml-auto flex-none tabular-nums">
      {formatDuration(totals.actualOfTargeted)} of {formatDuration(
        totals.targeted,
      )} targeted
    </span>
  {/if}
</div>

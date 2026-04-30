<script lang="ts">
  import type { Category, BudgetMode } from "$lib/types";

  type CategoryPatch = {
    name?: string;
    color?: string;
    budgetMode?: BudgetMode;
    targetMinutes?: number | null;
  };

  type Props = {
    categories: Category[];
    onUpdate: (id: string, patch: CategoryPatch) => void;
  };

  let { categories, onUpdate }: Props = $props();

  function parseHours(text: string): number | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*h?$/i);
    if (!match) return null;
    const hours = parseFloat(match[1]);
    if (!Number.isFinite(hours)) return null;
    return Math.round(hours * 60);
  }

  function formatTargetHours(minutes: number | null): string {
    if (minutes === null) return "";
    const hours = minutes / 60;
    return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
  }
</script>

<div class="space-y-2">
  {#each categories as category (category.id)}
    <div class="border-border bg-muted/15 rounded-md border p-3">
      <div class="mb-3 flex items-center gap-2">
        <input
          type="color"
          value={category.color}
          aria-label="Category color"
          class="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
          onchange={(event) => {
            const value = (event.currentTarget as HTMLInputElement).value;
            onUpdate(category.id, { color: value });
          }}
        />
        <input
          type="text"
          value={category.name}
          aria-label="Category name"
          class="text-foreground flex-1 border-none bg-transparent text-[13px] font-medium outline-none"
          onchange={(event) =>
            onUpdate(category.id, {
              name: (event.currentTarget as HTMLInputElement).value,
            })}
        />
      </div>
      <div class="grid grid-cols-2 gap-2 text-[11px]">
        <label class="block">
          <span class="text-muted-foreground mb-1 block">Mode</span>
          <select
            value={category.budgetMode}
            class="border-border bg-muted/30 text-foreground w-full rounded-md border px-2 py-1.5 outline-none"
            onchange={(event) =>
              onUpdate(category.id, {
                budgetMode: (event.currentTarget as HTMLSelectElement)
                  .value as BudgetMode,
              })}
          >
            <option value="target">Target</option>
            <option value="minimum">Minimum</option>
            <option value="observation">Observation</option>
          </select>
        </label>
        {#if category.budgetMode !== "observation"}
          <label class="block">
            <span class="text-muted-foreground mb-1 block">Goal</span>
            <input
              type="text"
              value={formatTargetHours(category.targetMinutes)}
              placeholder="20h"
              aria-label="Target hours per week"
              class="border-border bg-muted/30 text-foreground w-full rounded-md border px-2 py-1.5 outline-none focus:border-[#7aa2f7]"
              onchange={(event) => {
                const minutes = parseHours(
                  (event.currentTarget as HTMLInputElement).value,
                );
                onUpdate(category.id, { targetMinutes: minutes });
              }}
            />
          </label>
        {/if}
      </div>
    </div>
  {/each}
</div>

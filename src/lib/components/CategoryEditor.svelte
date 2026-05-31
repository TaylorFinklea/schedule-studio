<script lang="ts">
  import type { Category, BudgetMode } from "$lib/types";

  type CategoryPatch = {
    name?: string;
    color?: string;
    budgetMode?: BudgetMode;
    targetMinutes?: number | null;
    archived?: boolean;
  };

  type CategoryCreatePayload = {
    name: string;
    color: string;
    parentId?: string | null;
  };

  type Props = {
    categories: Category[];
    inUseIds: Set<string>;
    onUpdate: (id: string, patch: CategoryPatch) => void;
    onCreate: (payload: CategoryCreatePayload) => void;
    onDelete: (id: string) => void;
    onReorder: (id: string, direction: "up" | "down") => void;
  };

  let { categories, inUseIds, onUpdate, onCreate, onDelete, onReorder }: Props =
    $props();

  let creating = $state(false);
  let newName = $state("");
  let newColor = $state("#7aa2f7");

  // Subcategory create form, keyed by the parent currently being added to.
  let addingChildFor = $state<string | null>(null);
  let childName = $state("");
  let childColor = $state("#7aa2f7");

  const bySort = (a: Category, b: Category) => a.sortOrder - b.sortOrder;

  const activeParents = $derived(
    categories
      .filter((c) => c.parentId === null && !c.archived)
      .sort(bySort),
  );
  const archivedCategories = $derived(
    categories.filter((c) => c.archived).sort(bySort),
  );

  function childrenOf(parentId: string): Category[] {
    return categories
      .filter((c) => c.parentId === parentId && !c.archived)
      .sort(bySort);
  }

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

  function submitCreate() {
    const name = newName.trim();
    if (!name) return;
    onCreate({ name, color: newColor });
    newName = "";
    newColor = "#7aa2f7";
    creating = false;
  }

  function submitChild(parentId: string) {
    const name = childName.trim();
    if (!name) return;
    onCreate({ name, color: childColor, parentId });
    childName = "";
    childColor = "#7aa2f7";
    addingChildFor = null;
  }

  function openChildForm(parentId: string) {
    addingChildFor = parentId;
    childName = "";
    childColor = "#7aa2f7";
  }
</script>

<!-- Full editing controls for one category (parent or child). `siblingIdx` /
     `siblingCount` drive the within-group reorder arrows. -->
{#snippet categoryRow(category: Category, siblingIdx: number, siblingCount: number)}
  {@const inUse = inUseIds.has(category.id)}
  <div class="mb-3 flex items-center gap-2">
    <input
      type="color"
      value={category.color}
      aria-label="Category color"
      class="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
      onchange={(event) =>
        onUpdate(category.id, {
          color: (event.currentTarget as HTMLInputElement).value,
        })}
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
          onchange={(event) =>
            onUpdate(category.id, {
              targetMinutes: parseHours(
                (event.currentTarget as HTMLInputElement).value,
              ),
            })}
        />
      </label>
    {/if}
  </div>
  <div class="mt-3 flex justify-end gap-1 text-[11px]">
    <button
      type="button"
      class="text-muted-foreground hover:bg-muted hover:text-foreground rounded px-2 py-1 disabled:opacity-30"
      aria-label="Move up"
      data-testid="category-up-{category.id}"
      disabled={siblingIdx === 0}
      onclick={() => onReorder(category.id, "up")}
    >
      ↑
    </button>
    <button
      type="button"
      class="text-muted-foreground hover:bg-muted hover:text-foreground rounded px-2 py-1 disabled:opacity-30"
      aria-label="Move down"
      data-testid="category-down-{category.id}"
      disabled={siblingIdx === siblingCount - 1}
      onclick={() => onReorder(category.id, "down")}
    >
      ↓
    </button>
    <button
      type="button"
      class="text-muted-foreground hover:bg-muted hover:text-foreground rounded px-2 py-1"
      data-testid="category-archive-{category.id}"
      onclick={() => onUpdate(category.id, { archived: true })}
    >
      Archive
    </button>
    <button
      type="button"
      class="rounded px-2 py-1 text-red-300 hover:bg-red-500/10 disabled:opacity-30 disabled:hover:bg-transparent"
      aria-label={inUse ? "Delete (used by items, archive instead)" : "Delete"}
      title={inUse ? "Used by schedule items or subcategories — archive instead" : ""}
      data-testid="category-delete-{category.id}"
      disabled={inUse}
      onclick={() => onDelete(category.id)}
    >
      Delete
    </button>
  </div>
{/snippet}

<div class="space-y-2">
  {#if creating}
    <form
      class="border-border bg-muted/15 flex items-center gap-2 rounded-md border p-3"
      onsubmit={(event) => {
        event.preventDefault();
        submitCreate();
      }}
    >
      <input
        type="color"
        bind:value={newColor}
        aria-label="New category color"
        class="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
      />
      <input
        type="text"
        bind:value={newName}
        aria-label="New category name"
        placeholder="Category name"
        class="text-foreground flex-1 border-none bg-transparent text-[13px] font-medium outline-none"
      />
      <button
        type="submit"
        class="bg-primary/15 border-primary/40 text-primary hover:bg-primary/25 rounded-md border px-2.5 py-1 text-[11px] font-medium"
        data-testid="category-create-submit"
      >
        Add
      </button>
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground rounded px-1.5 text-[11px]"
        onclick={() => {
          creating = false;
          newName = "";
        }}
      >
        Cancel
      </button>
    </form>
  {:else}
    <button
      type="button"
      class="border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground w-full rounded-md border border-dashed px-3 py-2 text-[12px]"
      data-testid="category-create-open"
      onclick={() => (creating = true)}
    >
      + New category
    </button>
  {/if}

  {#each activeParents as parent, idx (parent.id)}
    {@const children = childrenOf(parent.id)}
    <div
      class="border-border bg-muted/15 rounded-md border p-3"
      data-testid="category-row-{parent.id}"
    >
      {@render categoryRow(parent, idx, activeParents.length)}

      {#if children.length > 0}
        <div class="border-border/60 mt-3 space-y-2 border-l pl-3">
          {#each children as child, childIdx (child.id)}
            <div
              class="border-border bg-muted/10 rounded-md border p-3"
              data-testid="category-row-{child.id}"
            >
              {@render categoryRow(child, childIdx, children.length)}
            </div>
          {/each}
        </div>
      {/if}

      {#if addingChildFor === parent.id}
        <form
          class="border-border bg-muted/10 mt-2 ml-3 flex items-center gap-2 rounded-md border p-2.5"
          onsubmit={(event) => {
            event.preventDefault();
            submitChild(parent.id);
          }}
        >
          <input
            type="color"
            bind:value={childColor}
            aria-label="New subcategory color"
            class="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          <input
            type="text"
            bind:value={childName}
            aria-label="New subcategory name"
            placeholder="Subcategory name"
            class="text-foreground flex-1 border-none bg-transparent text-[13px] font-medium outline-none"
          />
          <button
            type="submit"
            class="bg-primary/15 border-primary/40 text-primary hover:bg-primary/25 rounded-md border px-2.5 py-1 text-[11px] font-medium"
            data-testid="subcategory-create-submit-{parent.id}"
          >
            Add
          </button>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground rounded px-1.5 text-[11px]"
            onclick={() => (addingChildFor = null)}
          >
            Cancel
          </button>
        </form>
      {:else}
        <button
          type="button"
          class="border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground mt-2 ml-3 w-[calc(100%-0.75rem)] rounded-md border border-dashed px-3 py-1.5 text-[11px]"
          data-testid="subcategory-create-open-{parent.id}"
          onclick={() => openChildForm(parent.id)}
        >
          + Add subcategory
        </button>
      {/if}
    </div>
  {/each}

  {#if archivedCategories.length > 0}
    <div
      class="text-muted-foreground pt-2 text-[10px] font-semibold tracking-[0.12em] uppercase"
    >
      Archived
    </div>
    {#each archivedCategories as category (category.id)}
      {@const inUse = inUseIds.has(category.id)}
      <div
        class="border-border bg-muted/10 rounded-md border p-3 opacity-60"
        data-testid="category-row-{category.id}"
      >
        <div class="flex items-center gap-2">
          <span
            class="block h-3 w-3 rounded-full"
            style="background:{category.color};"
            aria-hidden="true"
          ></span>
          <span class="text-foreground flex-1 truncate text-[13px] font-medium">
            {category.parentId !== null ? "└ " : ""}{category.name}
          </span>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground rounded px-2 py-1 text-[11px]"
            data-testid="category-unarchive-{category.id}"
            onclick={() => onUpdate(category.id, { archived: false })}
          >
            Unarchive
          </button>
          <button
            type="button"
            class="rounded px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10 disabled:opacity-30 disabled:hover:bg-transparent"
            data-testid="category-delete-{category.id}"
            disabled={inUse}
            onclick={() => onDelete(category.id)}
          >
            Delete
          </button>
        </div>
      </div>
    {/each}
  {/if}
</div>

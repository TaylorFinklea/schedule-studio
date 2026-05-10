<script lang="ts">
  import { GripVertical, X } from "lucide-svelte";
  import type { Category, ItemKind, Todo } from "$lib/types";

  type Props = {
    todos: Todo[];
    categories: Category[];
    onCreate: (payload: {
      title: string;
      kind: ItemKind;
      categoryId: string | null;
      durationMinutes: number | null;
    }) => void;
    onUpdate: (
      id: string,
      patch: Partial<{
        title: string;
        kind: ItemKind;
        categoryId: string | null;
        durationMinutes: number | null;
      }>,
    ) => void;
    onDelete: (id: string) => void;
    onDragStart: (todo: Todo, event: DragEvent) => void;
  };

  let { todos, categories, onCreate, onUpdate, onDelete, onDragStart }: Props =
    $props();

  let newTitle = $state("");
  let newKind = $state<ItemKind>("block");

  const activeCategories = $derived(categories.filter((c) => !c.archived));

  function categoryOf(id: string | null): Category | null {
    if (!id) return null;
    return categories.find((c) => c.id === id) ?? null;
  }

  function submitCreate() {
    const title = newTitle.trim();
    if (!title) return;
    onCreate({
      title,
      kind: newKind,
      categoryId: null,
      durationMinutes: null,
    });
    newTitle = "";
    newKind = "block";
  }

  function parseDuration(text: string): number | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(\d+)\s*m?$/i);
    if (!match) return null;
    const minutes = parseInt(match[1], 10);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
  }

  function formatDuration(minutes: number | null): string {
    if (minutes === null) return "";
    return `${minutes}m`;
  }
</script>

<aside
  class="border-border bg-surface flex h-full w-[300px] shrink-0 flex-col border-l"
  data-testid="todo-sidebar"
>
  <div class="border-border flex items-center justify-between border-b px-4 py-3">
    <h2 class="text-[13px] font-semibold tracking-tight">To do</h2>
    <span class="text-muted-foreground text-[10px] uppercase tracking-[0.12em]">
      Drag → grid
    </span>
  </div>

  <form
    class="border-border bg-muted/15 flex items-center gap-2 border-b px-3 py-3"
    onsubmit={(event) => {
      event.preventDefault();
      submitCreate();
    }}
  >
    <input
      type="text"
      bind:value={newTitle}
      aria-label="New todo title"
      placeholder="Start laundry"
      class="text-foreground flex-1 border-none bg-transparent text-[12px] outline-none placeholder:text-[color:var(--muted-foreground)]/60"
      data-testid="todo-create-input"
    />
    <div
      class="bg-muted/40 flex items-center rounded-md p-0.5 text-[10px]"
      role="group"
      aria-label="Item kind"
    >
      <button
        type="button"
        class="rounded px-1.5 py-0.5 transition-colors {newKind === 'block'
          ? 'bg-surface-2 text-foreground'
          : 'text-muted-foreground hover:text-foreground'}"
        aria-pressed={newKind === "block"}
        onclick={() => (newKind = "block")}
      >
        Block
      </button>
      <button
        type="button"
        class="rounded px-1.5 py-0.5 transition-colors {newKind === 'pin'
          ? 'bg-surface-2 text-foreground'
          : 'text-muted-foreground hover:text-foreground'}"
        aria-pressed={newKind === "pin"}
        onclick={() => (newKind = "pin")}
      >
        Pin
      </button>
    </div>
    <button
      type="submit"
      class="bg-primary/15 border-primary/40 text-primary hover:bg-primary/25 rounded-md border px-2 py-1 text-[11px] font-medium"
      data-testid="todo-create-submit"
    >
      Add
    </button>
  </form>

  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if todos.length === 0}
      <p class="text-muted-foreground px-4 py-6 text-center text-[11px]">
        No to-dos yet. Add one above, then drag it onto a day.
      </p>
    {:else}
      <ul class="space-y-2 p-3">
        {#each todos as todo (todo.id)}
          {@const category = categoryOf(todo.categoryId)}
          <li
            class="border-border bg-muted/15 hover:bg-muted/25 group rounded-md border p-2 transition-colors"
            draggable="true"
            data-testid="todo-row-{todo.id}"
            ondragstart={(event) => onDragStart(todo, event)}
          >
            <div class="flex items-center gap-2">
              <span
                class="text-muted-foreground/60 cursor-grab active:cursor-grabbing"
                aria-hidden="true"
              >
                <GripVertical size={14} />
              </span>
              {#if category}
                <span
                  class="h-2.5 w-2.5 shrink-0 rounded-full"
                  style="background:{category.color};"
                  aria-hidden="true"
                ></span>
              {/if}
              <input
                type="text"
                value={todo.title}
                aria-label="Todo title"
                class="text-foreground flex-1 border-none bg-transparent text-[12px] font-medium outline-none"
                onchange={(event) =>
                  onUpdate(todo.id, {
                    title: (event.currentTarget as HTMLInputElement).value,
                  })}
              />
              <button
                type="button"
                class="text-muted-foreground hover:bg-muted hover:text-red-300 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Delete todo"
                data-testid="todo-delete-{todo.id}"
                onclick={() => onDelete(todo.id)}
              >
                <X size={13} />
              </button>
            </div>
            <div class="mt-2 flex items-center gap-1.5 text-[10px]">
              <div
                class="bg-muted/40 flex items-center rounded p-0.5"
                role="group"
                aria-label="Item kind"
              >
                <button
                  type="button"
                  class="rounded px-1.5 py-0.5 transition-colors {todo.kind ===
                  'block'
                    ? 'bg-surface-2 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'}"
                  aria-pressed={todo.kind === "block"}
                  onclick={() => onUpdate(todo.id, { kind: "block" })}
                >
                  Block
                </button>
                <button
                  type="button"
                  class="rounded px-1.5 py-0.5 transition-colors {todo.kind ===
                  'pin'
                    ? 'bg-surface-2 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'}"
                  aria-pressed={todo.kind === "pin"}
                  onclick={() => onUpdate(todo.id, { kind: "pin" })}
                >
                  Pin
                </button>
              </div>
              <select
                value={todo.categoryId ?? ""}
                aria-label="Default category"
                class="border-border bg-muted/30 text-foreground min-w-0 flex-1 rounded border px-1.5 py-0.5 outline-none"
                onchange={(event) =>
                  onUpdate(todo.id, {
                    categoryId:
                      (event.currentTarget as HTMLSelectElement).value || null,
                  })}
              >
                <option value="">No category</option>
                {#each activeCategories as cat (cat.id)}
                  <option value={cat.id}>{cat.name}</option>
                {/each}
              </select>
              {#if todo.kind === "block"}
                <input
                  type="text"
                  value={formatDuration(todo.durationMinutes)}
                  placeholder="60m"
                  aria-label="Duration"
                  class="border-border bg-muted/30 text-foreground w-12 rounded border px-1.5 py-0.5 outline-none focus:border-[#7aa2f7]"
                  onchange={(event) =>
                    onUpdate(todo.id, {
                      durationMinutes: parseDuration(
                        (event.currentTarget as HTMLInputElement).value,
                      ),
                    })}
                />
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</aside>

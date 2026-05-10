<script lang="ts">
  import { Check, Plus, Star, Trash2, X } from "lucide-svelte";
  import type { ScheduleVersion } from "$lib/types";
  import { formatDuration } from "$lib/schedule";

  type Props = {
    versions: ScheduleVersion[];
    activeId: string;
    defaultId: string;
    onActivate: (id: string) => void;
    onCreate: (name: string) => void;
    onRename: (id: string, name: string) => void;
    onDelete: (id: string) => void;
    onSetDefault: (id: string) => void;
    onClose: () => void;
  };

  let { versions, activeId, defaultId, onActivate, onCreate, onRename, onDelete, onSetDefault, onClose }: Props =
    $props();

  let newName = $state("");
  let renameValue = $state("");

  const active = $derived(versions.find((v) => v.id === activeId));

  $effect(() => {
    renameValue = active?.name ?? "";
  });

  function submitCreate() {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    newName = "";
  }

  function submitRename() {
    const next = renameValue.trim();
    if (!next || !active || next === active.name) return;
    onRename(active.id, next);
  }

  function confirmDelete(version: ScheduleVersion) {
    const ok = window.confirm(
      `Delete sandbox "${version.name}"? Its ${version.itemCount} items will be removed. This cannot be undone.`,
    );
    if (ok) onDelete(version.id);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  role="presentation"
  class="fixed inset-0 z-40 flex items-start justify-start bg-black/30 backdrop-blur-sm"
  onclick={() => onClose()}
>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <section
    class="border-border bg-surface mt-16 ml-4 w-80 rounded-lg border p-4 shadow-2xl shadow-black/40"
    onclick={(event) => event.stopPropagation()}
    aria-label="Schedule versions"
  >
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-[13px] font-semibold tracking-tight">Schedule versions</h2>
      <button
        type="button"
        class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
        aria-label="Close"
        onclick={() => onClose()}
      >
        <X size={14} />
      </button>
    </div>

    <ul class="mb-4 space-y-1">
      {#each versions as version (version.id)}
        <li
          class="border-border hover:bg-muted/50 group relative flex items-stretch overflow-hidden rounded-md border {version.id ===
          activeId
            ? 'border-[#7aa2f7]/60 bg-[#7aa2f7]/12'
            : 'border-transparent'}"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-[12px]"
            onclick={() => onActivate(version.id)}
          >
            <span
              class="block h-2 w-2 rounded-full {version.id === defaultId
                ? 'bg-[#9ece6a]'
                : 'bg-[#bb9af7]'}"
            ></span>
            <span class="min-w-0 flex-1">
              <span class="text-foreground block truncate font-medium">
                {version.name}
              </span>
              <span class="text-muted-foreground block font-mono text-[10px] tabular-nums">
                {formatDuration(version.totalMinutes)} · {version.itemCount} items
              </span>
            </span>
            {#if version.id === activeId}
              <Check size={14} class="text-[#7aa2f7]" />
            {/if}
          </button>
          {#if version.id !== defaultId}
            <button
              type="button"
              class="text-muted-foreground hover:bg-amber-500/10 hover:text-amber-300 flex shrink-0 items-center justify-center px-2 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              aria-label="Set {version.name} as default"
              data-testid="version-set-default-{version.id}"
              onclick={(event) => {
                event.stopPropagation();
                onSetDefault(version.id);
              }}
            >
              <Star size={13} />
            </button>
            <button
              type="button"
              class="text-muted-foreground hover:bg-red-500/10 hover:text-red-300 flex shrink-0 items-center justify-center px-2 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              aria-label="Delete sandbox {version.name}"
              data-testid="version-delete-{version.id}"
              onclick={(event) => {
                event.stopPropagation();
                confirmDelete(version);
              }}
            >
              <Trash2 size={13} />
            </button>
          {/if}
        </li>
      {/each}
    </ul>

    <div class="border-border mb-4 space-y-2 border-t pt-3">
      <div class="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
        New sandbox
      </div>
      <form
        class="flex gap-2"
        onsubmit={(event) => {
          event.preventDefault();
          submitCreate();
        }}
      >
        <input
          type="text"
          placeholder="Name (e.g. Vacation week)"
          bind:value={newName}
          aria-label="New sandbox name"
          class="border-border bg-muted/30 flex-1 rounded-md border px-2 py-1.5 text-[12px] outline-none focus:border-[#7aa2f7]"
        />
        <button
          type="submit"
          class="bg-primary/15 border-primary/40 text-primary hover:bg-primary/25 flex items-center gap-1 rounded-md border px-2.5 text-[12px] font-medium"
          aria-label="Create sandbox"
        >
          <Plus size={13} />
        </button>
      </form>
    </div>

    {#if active}
      <div class="border-border space-y-2 border-t pt-3">
        <div class="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
          Rename current
        </div>
        <form
          class="flex gap-2"
          onsubmit={(event) => {
            event.preventDefault();
            submitRename();
          }}
        >
          <input
            type="text"
            bind:value={renameValue}
            aria-label="Rename current version"
            class="border-border bg-muted/30 flex-1 rounded-md border px-2 py-1.5 text-[12px] outline-none focus:border-[#7aa2f7]"
          />
          <button
            type="submit"
            class="border-border text-muted-foreground hover:bg-muted hover:text-foreground rounded-md border px-2.5 text-[12px]"
          >
            Save
          </button>
        </form>
        {#if active.id !== defaultId}
          <button
            type="button"
            class="flex w-full items-center justify-center gap-1.5 rounded-md border border-amber-400/30 px-3 py-1.5 text-[12px] text-amber-300 hover:bg-amber-500/10"
            data-testid="version-set-default-active"
            onclick={() => onSetDefault(active.id)}
          >
            <Star size={13} /> Set as default
          </button>
          <button
            type="button"
            class="flex w-full items-center justify-center gap-1.5 rounded-md border border-red-400/30 px-3 py-1.5 text-[12px] text-red-300 hover:bg-red-500/10"
            onclick={() => confirmDelete(active)}
          >
            <Trash2 size={13} /> Delete sandbox
          </button>
        {/if}
      </div>
    {/if}
  </section>
</div>

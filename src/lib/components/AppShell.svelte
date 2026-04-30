<script lang="ts">
  import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    MoreVertical,
    Plus,
    ZoomIn,
    ZoomOut,
  } from "lucide-svelte";

  type LayoutMode = "vertical" | "horizontal";

  type Props = {
    versionLabel: string;
    weekRangeLabel: string;
    layoutMode: LayoutMode;
    hourHeight: number;
    defaultZoom: number;
    zoomStep: number;
    onLayoutChange: (mode: LayoutMode) => void;
    onZoomChange: (height: number) => void;
    onPrevWeek?: () => void;
    onNextWeek?: () => void;
    onAdd: () => void;
    onMenu: () => void;
    onVersionMenu?: () => void;
  };

  let {
    versionLabel,
    weekRangeLabel,
    layoutMode,
    hourHeight,
    defaultZoom,
    zoomStep,
    onLayoutChange,
    onZoomChange,
    onPrevWeek,
    onNextWeek,
    onAdd,
    onMenu,
    onVersionMenu,
  }: Props = $props();

  const zoomPercent = $derived(Math.round((hourHeight / defaultZoom) * 100));
</script>

<header
  class="border-border bg-surface flex h-14 shrink-0 items-center gap-3 border-b px-4"
>
  <div class="flex items-center gap-2">
    <span class="bg-primary block h-2 w-2 rounded-full" aria-hidden="true"
    ></span>
    <button
      type="button"
      class="text-foreground hover:bg-muted flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium tracking-tight"
      onclick={() => onVersionMenu?.()}
      data-testid="version-menu"
    >
      {versionLabel}
      <ChevronDown size={13} class="text-muted-foreground" />
    </button>
  </div>

  <div
    class="text-foreground/90 mx-auto flex items-center gap-2 text-[13px] tabular-nums"
  >
    <button
      type="button"
      class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1.5"
      onclick={() => onPrevWeek?.()}
      aria-label="Previous week"
    >
      <ChevronLeft size={16} />
    </button>
    <span>{weekRangeLabel}</span>
    <button
      type="button"
      class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1.5"
      onclick={() => onNextWeek?.()}
      aria-label="Next week"
    >
      <ChevronRight size={16} />
    </button>
  </div>

  <div class="flex items-center gap-2">
    <div
      class="bg-muted/40 flex items-center rounded-md p-0.5 text-[11px]"
      role="group"
      aria-label="Layout"
    >
      <button
        type="button"
        class="rounded px-2 py-1 transition-colors {layoutMode === 'horizontal'
          ? 'bg-surface-2 text-foreground'
          : 'text-muted-foreground hover:text-foreground'}"
        onclick={() => onLayoutChange("horizontal")}
        data-testid="layout-horizontal"
        aria-pressed={layoutMode === "horizontal"}
      >
        Rows
      </button>
      <button
        type="button"
        class="rounded px-2 py-1 transition-colors {layoutMode === 'vertical'
          ? 'bg-surface-2 text-foreground'
          : 'text-muted-foreground hover:text-foreground'}"
        onclick={() => onLayoutChange("vertical")}
        data-testid="layout-vertical"
        aria-pressed={layoutMode === "vertical"}
      >
        Cols
      </button>
    </div>

    <div
      class="bg-muted/40 text-muted-foreground flex items-center rounded-md p-0.5 text-[11px]"
      role="group"
      aria-label="Zoom"
    >
      <button
        type="button"
        class="hover:bg-muted hover:text-foreground rounded p-1"
        aria-label="Zoom out"
        onclick={() => onZoomChange(hourHeight - zoomStep)}
      >
        <ZoomOut size={13} />
      </button>
      <button
        type="button"
        class="hover:bg-muted hover:text-foreground min-w-12 rounded px-1 py-1 tabular-nums"
        aria-label="Reset zoom"
        title="Reset zoom"
        onclick={() => onZoomChange(defaultZoom)}
      >
        {zoomPercent}%
      </button>
      <button
        type="button"
        class="hover:bg-muted hover:text-foreground rounded p-1"
        aria-label="Zoom in"
        onclick={() => onZoomChange(hourHeight + zoomStep)}
      >
        <ZoomIn size={13} />
      </button>
    </div>

    <button
      type="button"
      class="bg-primary/15 border-primary/40 text-primary hover:bg-primary/25 flex h-7 items-center gap-1 rounded-md border px-2 text-[12px] font-medium"
      onclick={() => onAdd()}
    >
      <Plus size={13} /> Add
    </button>

    <button
      type="button"
      class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1.5"
      aria-label="More"
      data-testid="settings-button"
      onclick={() => onMenu()}
    >
      <MoreVertical size={16} />
    </button>
  </div>
</header>

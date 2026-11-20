<script lang="ts">
  type Props = {
    ariaLabel: string;
    testId: string;
    variant: "header" | "timeline";
    onOpen: (event: MouseEvent) => void;
  };

  let { ariaLabel, testId, variant, onOpen }: Props = $props();
</script>

<button
  type="button"
  class={variant === "header"
    ? "text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 rounded px-1.5 py-1 text-[10px]"
    : "text-muted-foreground hover:text-foreground decoration-border text-left text-[10px] underline underline-offset-2"}
  aria-label={ariaLabel}
  data-testid={testId}
  onclick={onOpen}
>
  Totals
</button>

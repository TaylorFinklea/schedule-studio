<script lang="ts">
  import "../app.css";

  let { children } = $props();
</script>

<svelte:head>
  <title>Schedule Studio</title>
  <meta
    name="description"
    content="A local-first weekly schedule planner for auditing where time goes."
  />
</svelte:head>

{@render children()}

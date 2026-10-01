<script lang="ts">
  let { code }: { code: string } = $props();
  const words = $derived(code.split(' '));
</script>

<ol class="words" aria-label="救援碼">
  {#each words as word, i (i)}
    <li>{word}</li>
  {/each}
</ol>

<style>
  .words {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem 1.5rem;
    padding: 1rem 1rem 1rem 2.5rem;
    background: var(--brass-soft);
    border-left: 4px solid var(--brass);
    border-radius: 0 var(--radius-m) var(--radius-m) 0;
    font-family: var(--mono);
    font-size: 1.05rem;
  }

  li::marker {
    color: var(--brass);
    font-size: 0.85rem;
  }
</style>

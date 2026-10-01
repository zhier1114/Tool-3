<script lang="ts">
  /** 鑰匙條：以等寬字顯示密碼，字母、數字、符號分色，方便分辨 l/1/I、O/0。 */
  let { value, masked = false }: { value: string; masked?: boolean } = $props();

  type Kind = 'alpha' | 'digit' | 'space' | 'symbol';
  const kindOf = (c: string): Kind =>
    /[0-9]/.test(c) ? 'digit' : /[A-Za-z]/.test(c) ? 'alpha' : /\s/.test(c) ? 'space' : 'symbol';
  const chars = $derived([...value].map((c) => ({ c, kind: kindOf(c) })));
</script>

<span class="key" class:empty={!value}>
  {#if !value}
    未設定
  {:else if masked}
    <span class="dots" aria-label="已隱藏的密碼">••••••••••</span>
  {:else}
    {#each chars as ch, i (i)}<span class={ch.kind}>{ch.kind === 'space' ? '␣' : ch.c}</span>{/each}
  {/if}
</span>

<style>
  .key {
    display: inline-block;
    max-width: 100%;
    padding: 0.35rem 0.65rem;
    font-family: var(--mono);
    font-size: 1.05rem;
    letter-spacing: 0.04em;
    line-height: 1.5;
    word-break: break-all;
    background: var(--brass-soft);
    border-left: 4px solid var(--brass);
    border-radius: 0 var(--radius-s) var(--radius-s) 0;
  }

  .empty {
    font-family: var(--font);
    color: var(--ink-soft);
    letter-spacing: 0;
  }

  .dots {
    color: var(--ink-soft);
    letter-spacing: 0.18em;
  }

  .alpha {
    color: var(--ink);
  }

  .digit {
    color: var(--brass);
    font-weight: 700;
  }

  .symbol {
    color: var(--indigo);
    font-weight: 700;
  }

  .space {
    color: var(--ink-soft);
  }
</style>

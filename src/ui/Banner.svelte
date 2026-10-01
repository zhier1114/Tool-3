<script lang="ts">
  import type { AppController } from '../app/controller.svelte';

  let { app }: { app: AppController } = $props();
</script>

{#if app.banner}
  <div
    class="banner"
    class:error={app.banner.kind === 'error'}
    role={app.banner.kind === 'error' ? 'alert' : 'status'}
  >
    <p>{app.banner.text}</p>
    <button class="btn-quiet" onclick={() => app.dismissBanner()}>關閉</button>
  </div>
{/if}

<style>
  .banner {
    position: fixed;
    z-index: 50;
    top: calc(env(safe-area-inset-top) + 0.75rem);
    left: 0;
    right: 0;
    margin: 0 auto;
    width: min(34rem, calc(100% - 1.5rem));
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.25rem 0.25rem 1rem;
    border-radius: var(--radius-m);
    background: var(--ink);
    color: var(--paper);
  }

  .banner p {
    flex: 1;
    padding-block: 0.5rem;
  }

  .banner .btn-quiet {
    color: inherit;
  }

  .banner.error {
    background: var(--surface);
    color: var(--danger);
    border: 2px solid var(--danger);
  }
</style>

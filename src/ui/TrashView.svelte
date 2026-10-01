<script lang="ts">
  import type { AppController } from '../app/controller.svelte';
  import { daysLeftInTrash, purgeEntry, restoreEntry, trashedEntries, type VaultData } from '../core/model';

  let { app, data }: { app: AppController; data: VaultData } = $props();

  const items = $derived(trashedEntries(data));
  let confirmId = $state<string | null>(null);
  const today = new Date();

  function purge(id: string) {
    confirmId = null;
    void app.mutate((d, now) => purgeEntry(d, id, now));
  }
</script>

<section class="trash">
  <header>
    <h2>垃圾桶</h2>
    <p class="muted">項目放進垃圾桶 30 天後會自動永久刪除。</p>
  </header>

  {#if items.length === 0}
    <p class="muted">垃圾桶是空的。</p>
  {:else}
    <ul>
      {#each items as entry (entry.id)}
        <li>
          <div class="info">
            <strong>{entry.title}</strong>
            <span class="muted">{entry.username || '沒有帳號'}</span>
            <span class="left">剩 {daysLeftInTrash(entry, today)} 天自動刪除</span>
          </div>
          <div class="row">
            <button disabled={app.busy} onclick={() => app.mutate((d, now) => restoreEntry(d, entry.id, now))}>還原</button>
            {#if confirmId === entry.id}
              <button class="btn-danger" disabled={app.busy} onclick={() => purge(entry.id)}>確定永久刪除</button>
              <button class="btn-quiet" onclick={() => (confirmId = null)}>取消</button>
            {:else}
              <button class="btn-danger" onclick={() => (confirmId = entry.id)}>永久刪除</button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .trash {
    display: grid;
    gap: 1.25rem;
  }

  header {
    display: grid;
    gap: 0.3rem;
  }

  ul {
    list-style: none;
  }

  li {
    display: grid;
    gap: 0.6rem;
    padding: 0.9rem 0;
  }

  li + li {
    border-top: 1px solid var(--line);
  }

  .info {
    display: grid;
    gap: 0.1rem;
  }

  .left {
    font-size: 0.85rem;
    color: var(--brass);
  }
</style>

<script lang="ts">
  import { formatDay } from '../app/format';
  import type { Entry } from '../core/model';

  let {
    entries,
    selectedId,
    emptyText,
    onselect,
  }: { entries: Entry[]; selectedId: string | null; emptyText: string; onselect: (id: string) => void } = $props();
</script>

{#if entries.length === 0}
  <p class="empty muted">{emptyText}</p>
{:else}
  <ul class="list">
    {#each entries as entry (entry.id)}
      <li>
        <button class="item" class:selected={entry.id === selectedId} onclick={() => onselect(entry.id)}>
          <span class="title">
            {#if entry.starred}<span class="star" aria-hidden="true">★</span><span class="sr">已加星號，</span>{/if}{entry.title}
          </span>
          <span class="date">{formatDay(entry.updatedAt)}</span>
          <span class="sub">{entry.username || '沒有帳號'}</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .list {
    list-style: none;
  }

  li + li {
    border-top: 1px solid var(--line);
  }

  .item {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.1rem 0.75rem;
    padding: 0.7rem 1rem;
    text-align: left;
    border: 0;
    border-left: 3px solid transparent;
    border-radius: 0;
    background: transparent;
  }

  .item:hover {
    background: var(--surface);
  }

  .item.selected {
    background: var(--surface);
    border-left-color: var(--indigo);
  }

  .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .star {
    color: var(--brass);
    margin-right: 0.3rem;
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .date {
    color: var(--ink-soft);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    align-self: center;
  }

  .sub {
    grid-column: 1 / -1;
    color: var(--ink-soft);
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    padding: 1.5rem 1rem;
  }
</style>

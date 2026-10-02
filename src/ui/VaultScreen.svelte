<script lang="ts">
  import type { AppController } from '../app/controller.svelte';
  import {
    activeEntries,
    addEntry,
    allTags,
    setStarred,
    trashEntry,
    trashedEntries,
    updateEntry,
    type EntryFields,
    type VaultData,
  } from '../core/model';
  import { searchEntries, sortEntries, type SortMode } from '../core/query';
  import EntryDetail from './EntryDetail.svelte';
  import EntryForm from './EntryForm.svelte';
  import EntryList from './EntryList.svelte';
  import Settings from './Settings.svelte';
  import TrashView from './TrashView.svelte';

  let { app, data }: { app: AppController; data: VaultData } = $props();

  type View =
    | { kind: 'list' }
    | { kind: 'detail'; id: string }
    | { kind: 'edit'; id: string | null }
    | { kind: 'trash' }
    | { kind: 'settings' };

  let view = $state<View>({ kind: 'list' });
  let query = $state('');
  let tag = $state<string | null>(null);

  const tags = $derived(allTags(data));
  const active = $derived(activeEntries(data));
  const entries = $derived(sortEntries(searchEntries(active, query, tag), app.prefs.sort));
  const trashCount = $derived(trashedEntries(data).length);
  const selectedId = $derived(view.kind === 'detail' || view.kind === 'edit' ? view.id : null);
  const selected = $derived(selectedId ? (data.entries.find((e) => e.id === selectedId) ?? null) : null);
  const emptyText = $derived(
    active.length === 0
      ? '還沒有任何密碼。按「新增」加入第一筆。'
      : query
        ? `找不到符合「${query}」的項目。`
        : '這個標籤下沒有項目。',
  );

  // 篩選中的標籤被刪光時，自動回到「全部」。
  $effect(() => {
    if (tag && !tags.includes(tag)) tag = null;
  });

  function edit(id: string | null) {
    if (app.requireFreshToken()) view = { kind: 'edit', id };
  }

  async function save(fields: EntryFields) {
    const id = view.kind === 'edit' ? view.id : null;
    let savedId = id;
    const applied = await app.mutate((d, now) => {
      if (id) return updateEntry(d, id, fields, now);
      const result = addEntry(d, fields, now);
      savedId = result.entry.id;
      return result.data;
    });
    if (applied && savedId) view = { kind: 'detail', id: savedId };
  }

  async function star(id: string, starred: boolean) {
    await app.mutate((d, now) => setStarred(d, id, starred, now));
  }

  async function trash(id: string) {
    if (await app.mutate((d, now) => trashEntry(d, id, now))) {
      view = { kind: 'list' };
      app.showBanner('info', '已移到垃圾桶，30 天內可以還原');
    }
  }
</script>

<div class="shell" class:show-pane={view.kind !== 'list'}>
  <header class="top">
    <h1 class="brand">密碼庫</h1>
    <nav class="actions" aria-label="主要動作">
      <button class="btn-primary" onclick={() => edit(null)}>新增</button>
      <button class="btn-quiet" aria-pressed={view.kind === 'trash'} onclick={() => (view = { kind: 'trash' })}>
        垃圾桶{trashCount ? `（${trashCount}）` : ''}
      </button>
      <button class="btn-quiet" aria-pressed={view.kind === 'settings'} onclick={() => (view = { kind: 'settings' })}>
        設定
      </button>
      <button class="btn-quiet" onclick={() => app.lock()}>鎖定</button>
    </nav>
  </header>

  <p class="status" aria-live="polite">
    {#if app.busy}<span>同步中…</span>{/if}
    {#if app.clipboardSeconds > 0}<span class="clip">剪貼簿將在 {app.clipboardSeconds} 秒後清除</span>{/if}
  </p>

  <section class="list-col" aria-label="密碼清單">
    <div class="filters">
      <input type="search" bind:value={query} placeholder="搜尋標題、網站、帳號、標籤" aria-label="搜尋" />
      {#if tags.length}
        <div class="chips" role="group" aria-label="依標籤篩選">
          <button class="chip" aria-pressed={tag === null} onclick={() => (tag = null)}>全部</button>
          {#each tags as t (t)}
            <button class="chip" aria-pressed={tag === t} onclick={() => (tag = tag === t ? null : t)}>{t}</button>
          {/each}
        </div>
      {/if}
      <div class="filter-row">
        <span class="count">{entries.length} 筆</span>
        <select
          class="sort"
          aria-label="排序方式"
          value={app.prefs.sort}
          onchange={(e) => app.updatePrefs({ sort: e.currentTarget.value as SortMode })}
        >
          <option value="updated">最近更新</option>
          <option value="title">依標題</option>
        </select>
      </div>
    </div>
    <EntryList {entries} {selectedId} {emptyText} onselect={(id) => (view = { kind: 'detail', id })} />
  </section>

  <section class="pane">
    {#if view.kind !== 'list'}
      <button class="btn-quiet back" onclick={() => (view = { kind: 'list' })}>‹ 返回清單</button>
    {/if}

    {#if view.kind === 'detail' && selected}
      {#key selected.id}
        <EntryDetail
          {app}
          entry={selected}
          onedit={() => edit(selected.id)}
          ontrash={() => trash(selected.id)}
          onstar={() => star(selected.id, !selected.starred)}
        />
      {/key}
    {:else if view.kind === 'edit'}
      {#key view.id}
        <EntryForm
          {app}
          entry={selected}
          suggestions={tags}
          onsave={save}
          oncancel={() => (view = view.kind === 'edit' && view.id ? { kind: 'detail', id: view.id } : { kind: 'list' })}
        />
      {/key}
    {:else if view.kind === 'trash'}
      <TrashView {app} {data} />
    {:else if view.kind === 'settings'}
      <Settings {app} />
    {:else}
      <p class="placeholder muted">從左邊選一筆資料，或按「新增」。</p>
    {/if}
  </section>
</div>

<style>
  .shell {
    min-height: 100vh;
    display: grid;
    grid-template-rows: auto auto 1fr;
    grid-template-areas: 'top' 'status' 'main';
  }

  .top {
    grid-area: top;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem 0.4rem 1rem;
    flex-wrap: wrap;
  }

  .brand {
    font-size: 1.25rem;
    margin-right: auto;
    padding-left: 0.6rem;
    border-left: 4px solid var(--brass);
  }

  .actions {
    display: flex;
    gap: 0.15rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .actions .btn-quiet[aria-pressed='true'] {
    text-decoration: underline;
    text-underline-offset: 0.3em;
  }

  .status {
    grid-area: status;
    display: flex;
    gap: 1rem;
    min-height: 1.4rem;
    padding: 0 1rem;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }

  .clip {
    color: var(--brass);
  }

  .list-col,
  .pane {
    grid-area: main;
    min-width: 0;
  }

  .pane {
    display: none;
    padding: 0.5rem 1rem 3rem;
    max-width: 44rem;
  }

  .show-pane .pane {
    display: block;
  }

  .show-pane .list-col {
    display: none;
  }

  .back {
    margin: 0 0 0.75rem -0.5rem;
  }

  .filters {
    display: grid;
    gap: 0.6rem;
    padding: 0.25rem 1rem 0.75rem;
  }

  .filter-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .count {
    color: var(--ink-soft);
    font-size: 0.85rem;
  }

  .chips {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    scrollbar-width: none;
    margin-inline: -1rem;
    padding-inline: 1rem;
  }

  .chip {
    flex: none;
    min-height: 36px;
    padding: 0.25rem 0.8rem;
    border-radius: 999px;
    font-size: 0.9rem;
  }

  .chip[aria-pressed='true'] {
    background: var(--indigo);
    border-color: var(--indigo);
    color: var(--indigo-fg);
  }

  .sort {
    width: auto;
    margin-left: auto;
    min-height: 36px;
    padding: 0.25rem 0.5rem;
    font-size: 0.9rem;
  }

  .placeholder {
    padding-top: 3rem;
  }

  @media (min-width: 880px) {
    .shell {
      grid-template-columns: 22.5rem 1fr;
      grid-template-areas:
        'top top'
        'status status'
        'list pane';
    }

    .list-col,
    .show-pane .list-col {
      grid-area: list;
      display: block;
      border-right: 1px solid var(--line);
    }

    .pane,
    .show-pane .pane {
      grid-area: pane;
      display: block;
      padding: 0.5rem 2rem 3rem;
    }

    .back {
      display: none;
    }
  }
</style>

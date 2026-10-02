<script lang="ts">
  import type { AppController } from '../app/controller.svelte';
  import { formatDate } from '../app/format';
  import { safeUrl } from '../app/url';
  import { orderTags, type Entry } from '../core/model';
  import KeyText from './KeyText.svelte';

  let {
    app,
    entry,
    onedit,
    ontrash,
    onstar,
  }: { app: AppController; entry: Entry; onedit: () => void; ontrash: () => void; onstar: () => void } = $props();

  let reveal = $state(false);
  let showHistory = $state(false);
  let revealedOld = $state<number | null>(null);
  const href = $derived(safeUrl(entry.url));
</script>

<article class="detail">
  <header>
    <div class="title-row">
      <h2>{entry.title}</h2>
      <button
        class="btn-quiet star"
        class:on={entry.starred}
        aria-pressed={!!entry.starred}
        aria-label={entry.starred ? '移除星號' : '加上星號'}
        onclick={onstar}>{entry.starred ? '★' : '☆'}</button
      >
    </div>
    {#if entry.tags.length}
      <ul class="tags">
        {#each orderTags(entry.tags) as tag (tag)}<li>{tag}</li>{/each}
      </ul>
    {/if}
  </header>

  <dl class="fields">
    <div>
      <dt>網站</dt>
      <dd>
        {#if href}
          <a {href} target="_blank" rel="noopener noreferrer">{entry.url}</a>
        {:else}
          {entry.url || '—'}
        {/if}
      </dd>
    </div>
    <div>
      <dt>帳號</dt>
      <dd class="with-action">
        <span class="value">{entry.username || '—'}</span>
        {#if entry.username}
          <button onclick={() => app.copy(entry.username, '帳號')}>複製</button>
        {/if}
      </dd>
    </div>
    <div>
      <dt>密碼</dt>
      <dd class="password">
        <KeyText value={entry.password} masked={!reveal} />
        {#if entry.password}
          <div class="row">
            <button onclick={() => (reveal = !reveal)}>{reveal ? '隱藏' : '顯示'}</button>
            <button class="btn-primary" onclick={() => app.copy(entry.password, '密碼')}>複製密碼</button>
          </div>
        {/if}
      </dd>
    </div>
    {#if entry.notes}
      <div>
        <dt>備註</dt>
        <dd class="notes">{entry.notes}</dd>
      </div>
    {/if}
    <div>
      <dt>更新日期</dt>
      <dd>{formatDate(entry.updatedAt)}</dd>
    </div>
  </dl>

  {#if entry.passwordHistory.length}
    <section class="history">
      <button class="btn-quiet" aria-expanded={showHistory} onclick={() => (showHistory = !showHistory)}>
        {showHistory ? '收起舊密碼' : `查看舊密碼（${entry.passwordHistory.length} 組）`}
      </button>
      {#if showHistory}
        <ol>
          {#each entry.passwordHistory as old, i (i)}
            <li>
              <span class="muted">使用到 {formatDate(old.changedAt)}</span>
              <KeyText value={old.password} masked={revealedOld !== i} />
              <div class="row">
                <button onclick={() => (revealedOld = revealedOld === i ? null : i)}>
                  {revealedOld === i ? '隱藏' : '顯示'}
                </button>
                <button onclick={() => app.copy(old.password, '舊密碼')}>複製</button>
              </div>
            </li>
          {/each}
        </ol>
      {/if}
    </section>
  {/if}

  <footer class="row">
    <button class="btn-primary" onclick={onedit}>編輯</button>
    <button class="btn-danger" onclick={ontrash}>移到垃圾桶</button>
  </footer>
</article>

<style>
  .detail {
    display: grid;
    gap: 1.5rem;
  }

  header {
    display: grid;
    gap: 0.5rem;
  }

  .title-row {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  h2 {
    flex: 1;
    min-width: 0;
    font-size: 1.6rem;
    overflow-wrap: anywhere;
  }

  .star {
    font-size: 1.4rem;
    line-height: 1;
    padding: 0.2rem 0.4rem;
    color: var(--ink-soft);
  }

  .star.on {
    color: var(--brass);
  }

  .tags {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .tags li {
    font-size: 0.85rem;
    padding: 0.1rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--ink-soft);
  }

  .fields {
    margin: 0;
    display: grid;
    gap: 1.1rem;
  }

  dt {
    font-size: 0.85rem;
    color: var(--ink-soft);
    margin-bottom: 0.2rem;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .with-action {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .value {
    font-size: 1.05rem;
  }

  .password {
    display: grid;
    gap: 0.6rem;
    justify-items: start;
  }

  .notes {
    white-space: pre-wrap;
  }

  .history ol {
    list-style: none;
    display: grid;
    gap: 1rem;
    margin-top: 0.75rem;
  }

  .history li {
    display: grid;
    gap: 0.4rem;
    justify-items: start;
  }

  .history .muted {
    font-size: 0.85rem;
  }

  footer {
    padding-top: 1rem;
    border-top: 1px solid var(--line);
  }
</style>

<script lang="ts">
  import type { AppController } from '../app/controller.svelte';
  import { formatDate } from '../app/format';
  import type { Conflict, Resolution } from '../core/merge';
  import type { Entry } from '../core/model';
  import KeyText from './KeyText.svelte';

  let { app, conflicts }: { app: AppController; conflicts: Conflict[] } = $props();

  type Field = 'title' | 'url' | 'username' | 'password' | 'notes' | 'tags' | 'trashedAt' | 'updatedAt';
  const FIELDS: [Field, string][] = [
    ['title', '標題'],
    ['url', '網站'],
    ['username', '帳號'],
    ['password', '密碼'],
    ['notes', '備註'],
    ['tags', '標籤'],
    ['trashedAt', '狀態'],
    ['updatedAt', '修改時間'],
  ];

  let answers = $state<Record<string, Resolution>>({});
  let reveal = $state(false);
  const done = $derived(conflicts.every((c) => answers[c.id]));

  function text(entry: Entry, field: Field): string {
    if (field === 'tags') return entry.tags.join('、') || '—';
    if (field === 'trashedAt') return entry.trashedAt ? '在垃圾桶中' : '正常';
    if (field === 'updatedAt') return formatDate(entry.updatedAt);
    return entry[field] || '—';
  }

  function differs(c: Conflict, field: Field): boolean {
    return !!c.local && !!c.remote && text(c.local, field) !== text(c.remote, field);
  }

  const name = (c: Conflict) => (c.local ?? c.remote)?.title ?? '';
</script>

<div class="overlay">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
    <h2 id="conflict-title">兩台裝置改到了同一筆資料</h2>
    <p class="muted">這台裝置和雲端上的版本都改過下列項目，請逐一選擇要保留哪個版本。</p>
    <label class="check"><input type="checkbox" bind:checked={reveal} /> 顯示密碼</label>

    {#each conflicts as c (c.id)}
      <section class="conflict">
        <h3>{name(c)}</h3>
        {#if c.kind === 'edit' && c.local && c.remote}
          <div class="compare">
            {#each [{ label: '這台裝置', entry: c.local }, { label: '雲端', entry: c.remote }] as side (side.label)}
              <div class="side">
                <h4>{side.label}</h4>
                <dl>
                  {#each FIELDS as [field, label] (field)}
                    <dt class:diff={differs(c, field)}>{label}{differs(c, field) ? '（不同）' : ''}</dt>
                    <dd class:diff={differs(c, field)}>
                      {#if field === 'password'}
                        <KeyText value={side.entry.password} masked={!reveal} />
                      {:else}
                        {text(side.entry, field)}
                      {/if}
                    </dd>
                  {/each}
                </dl>
              </div>
            {/each}
          </div>
          <div class="choices" role="group" aria-label={`${name(c)} 要保留哪個版本`}>
            <button aria-pressed={answers[c.id] === 'local'} onclick={() => (answers[c.id] = 'local')}>用這台的</button>
            <button aria-pressed={answers[c.id] === 'remote'} onclick={() => (answers[c.id] = 'remote')}>用雲端的</button>
            <button aria-pressed={answers[c.id] === 'both'} onclick={() => (answers[c.id] = 'both')}>兩筆都留</button>
          </div>
        {:else}
          <p>
            {c.local
              ? '雲端上已經永久刪除這筆資料，但這台裝置修改過它。'
              : '這台裝置已經永久刪除這筆資料，但雲端上的版本被修改過。'}
          </p>
          <div class="choices" role="group" aria-label={`${name(c)} 要保留還是刪除`}>
            <button
              aria-pressed={answers[c.id] === (c.local ? 'local' : 'remote')}
              onclick={() => (answers[c.id] = c.local ? 'local' : 'remote')}>保留</button
            >
            <button
              aria-pressed={answers[c.id] === (c.local ? 'remote' : 'local')}
              onclick={() => (answers[c.id] = c.local ? 'remote' : 'local')}>刪除</button
            >
          </div>
        {/if}
      </section>
    {/each}

    <button class="btn-primary" disabled={!done} onclick={() => app.answerConflicts(answers)}>套用並儲存</button>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: start center;
    overflow-y: auto;
    padding: calc(env(safe-area-inset-top) + 1rem) 0.75rem 2rem;
    background: rgb(10 14 26 / 0.55);
  }

  .dialog {
    width: min(52rem, 100%);
    display: grid;
    gap: 1rem;
    padding: 1.5rem;
    border-radius: var(--radius-m);
    background: var(--surface);
  }

  .conflict {
    display: grid;
    gap: 0.75rem;
    padding-top: 1rem;
    border-top: 1px solid var(--line);
  }

  .compare {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 1rem;
  }

  .side {
    padding: 0.75rem 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-s);
    background: var(--paper);
  }

  h4 {
    margin-bottom: 0.5rem;
    color: var(--ink-soft);
  }

  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.35rem 0.75rem;
  }

  dt {
    color: var(--ink-soft);
    font-size: 0.85rem;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  dt.diff {
    color: var(--brass);
    font-weight: 700;
  }

  dd.diff {
    font-weight: 700;
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .choices button[aria-pressed='true'] {
    background: var(--indigo);
    border-color: var(--indigo);
    color: var(--indigo-fg);
    font-weight: 600;
  }
</style>

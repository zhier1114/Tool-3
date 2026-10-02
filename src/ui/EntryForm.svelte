<script lang="ts">
  import type { AppController } from '../app/controller.svelte';
  import { normalizeTags, orderTags, type Entry, type EntryFields } from '../core/model';
  import { focusOnMount } from './actions';
  import Generator from './Generator.svelte';

  let {
    app,
    entry,
    suggestions,
    onsave,
    oncancel,
  }: {
    app: AppController;
    entry: Entry | null;
    suggestions: string[];
    onsave: (fields: EntryFields) => void;
    oncancel: () => void;
  } = $props();

  // 表單以開啟當下的內容為初始值；父層以 {#key} 確保切換項目時重新建立。
  // svelte-ignore state_referenced_locally
  const initial = entry;
  let title = $state(initial?.title ?? '');
  let url = $state(initial?.url ?? '');
  let username = $state(initial?.username ?? '');
  let password = $state(initial?.password ?? '');
  let notes = $state(initial?.notes ?? '');
  let tags = $state<string[]>([...(initial?.tags ?? [])]);
  let tagInput = $state('');
  let showPassword = $state(false);
  let showGenerator = $state(false);
  let error = $state('');

  const shownTags = $derived(orderTags(tags));
  const available = $derived(suggestions.filter((t) => !tags.includes(t)));

  function commitTagInput() {
    const parts = tagInput.split(/[,，]/);
    if (parts.some((p) => p.trim())) tags = normalizeTags([...tags, ...parts]);
    tagInput = '';
  }

  function onTagKey(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitTagInput();
    } else if (event.key === 'Backspace' && !tagInput && tags.length) {
      const last = shownTags[shownTags.length - 1];
      tags = tags.filter((t) => t !== last);
    }
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    commitTagInput();
    if (!title.trim()) {
      error = '請輸入標題';
      return;
    }
    onsave({ title, url, username, password, notes, tags });
  }
</script>

<form class="form" onsubmit={submit}>
  <h2>{initial ? '編輯' : '新增'}</h2>

  <label class="field">
    <span>標題</span>
    <input bind:value={title} placeholder="例如：GitHub" use:focusOnMount />
  </label>
  {#if error}<p class="error-text" role="alert">{error}</p>{/if}

  <label class="field">
    <span>網站</span>
    <input bind:value={url} inputmode="url" autocapitalize="off" placeholder="github.com" />
  </label>

  <label class="field">
    <span>帳號</span>
    <input bind:value={username} autocapitalize="off" autocomplete="off" spellcheck="false" />
  </label>

  <div class="field">
    <label for="entry-password"><span class="label">密碼</span></label>
    <div class="password-row">
      <input
        id="entry-password"
        bind:value={password}
        type={showPassword ? 'text' : 'password'}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        class="mono"
      />
      <button type="button" onclick={() => (showPassword = !showPassword)}>{showPassword ? '隱藏' : '顯示'}</button>
      <button type="button" aria-expanded={showGenerator} onclick={() => (showGenerator = !showGenerator)}>
        產生
      </button>
    </div>
    {#if initial?.password}
      <p class="muted small">改了密碼之後，舊密碼會保留在「舊密碼」紀錄中。</p>
    {/if}
  </div>

  {#if showGenerator}
    <Generator
      {app}
      onuse={(pw) => {
        password = pw;
        showPassword = true;
        showGenerator = false;
      }}
    />
  {/if}

  <div class="field">
    <label for="entry-tags"><span class="label">標籤</span></label>
    <div class="tags">
      {#each shownTags as tag (tag)}
        <span class="tag">
          {tag}
          <button type="button" class="remove" aria-label={`移除標籤 ${tag}`} onclick={() => (tags = tags.filter((t) => t !== tag))}>×</button>
        </span>
      {/each}
      <input
        id="entry-tags"
        list="tag-suggestions"
        bind:value={tagInput}
        onkeydown={onTagKey}
        onblur={commitTagInput}
        placeholder={tags.length ? '' : '例如：工作、銀行（按 Enter 加入）'}
      />
      <datalist id="tag-suggestions">
        {#each available as tag (tag)}<option value={tag}></option>{/each}
      </datalist>
    </div>
  </div>

  <label class="field">
    <span>備註</span>
    <textarea bind:value={notes} rows="4"></textarea>
  </label>

  <div class="row actions">
    <button type="submit" class="btn-primary" disabled={app.busy}>{initial ? '儲存' : '新增'}</button>
    <button type="button" onclick={oncancel}>取消</button>
  </div>
</form>

<style>
  .form {
    display: grid;
    gap: 1rem;
  }

  .label {
    font-size: 0.875rem;
    color: var(--ink-soft);
  }

  .password-row {
    display: flex;
    gap: 0.5rem;
  }

  .password-row input {
    flex: 1;
    min-width: 0;
  }

  .mono {
    font-family: var(--mono);
  }

  .small {
    font-size: 0.85rem;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
    padding: 0.35rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-s);
    background: var(--surface);
  }

  .tags input {
    flex: 1;
    min-width: 8rem;
    border: 0;
    min-height: 36px;
    padding: 0.3rem 0.4rem;
  }

  .tags input:focus-visible {
    outline: none;
  }

  .tags:focus-within {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding-left: 0.6rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 0.9rem;
  }

  .remove {
    min-height: 0;
    padding: 0.1rem 0.5rem;
    border: 0;
    background: transparent;
    color: var(--ink-soft);
    border-radius: 999px;
  }

  .actions {
    padding-top: 0.5rem;
  }
</style>

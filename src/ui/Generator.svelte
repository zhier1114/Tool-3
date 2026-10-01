<script lang="ts">
  import { untrack } from 'svelte';
  import type { AppController } from '../app/controller.svelte';
  import { generatePassword } from '../core/generator';
  import KeyText from './KeyText.svelte';

  let { app, onuse }: { app: AppController; onuse: (password: string) => void } = $props();

  // 只取初始值；之後的修改由下方 effect 存回偏好設定。
  // svelte-ignore state_referenced_locally
  let mode = $state(app.prefs.generatorMode);
  // svelte-ignore state_referenced_locally
  let chars = $state({ ...app.prefs.chars });
  // svelte-ignore state_referenced_locally
  let words = $state({ ...app.prefs.words });
  let value = $state('');
  let error = $state('');

  function regenerate() {
    try {
      value = generatePassword(mode === 'chars' ? chars : words);
      error = '';
    } catch (e) {
      value = '';
      error = (e as Error).message;
    }
  }

  $effect(() => {
    const prefs = { generatorMode: mode, chars: $state.snapshot(chars), words: $state.snapshot(words) };
    untrack(() => {
      regenerate();
      app.updatePrefs(prefs);
    });
  });
</script>

<div class="generator">
  <div class="modes" role="group" aria-label="產生方式">
    <button type="button" aria-pressed={mode === 'chars'} onclick={() => (mode = 'chars')}>隨機字元</button>
    <button type="button" aria-pressed={mode === 'words'} onclick={() => (mode = 'words')}>英文詞組</button>
  </div>

  <div class="preview" aria-live="polite"><KeyText {value} /></div>

  {#if mode === 'chars'}
    <label class="field">
      <span>長度：{chars.length}</span>
      <input type="range" min="8" max="64" bind:value={chars.length} />
    </label>
    <div class="options">
      <label class="check"><input type="checkbox" bind:checked={chars.lower} /> 小寫字母</label>
      <label class="check"><input type="checkbox" bind:checked={chars.upper} /> 大寫字母</label>
      <label class="check"><input type="checkbox" bind:checked={chars.digits} /> 數字</label>
      <label class="check"><input type="checkbox" bind:checked={chars.symbols} /> 符號</label>
      <label class="check wide">
        <input type="checkbox" bind:checked={chars.excludeAmbiguous} /> 排除容易看錯的字 <code>0 O 1 l I</code>
      </label>
    </div>
  {:else}
    <label class="field">
      <span>字數：{words.wordCount}</span>
      <input type="range" min="3" max="8" bind:value={words.wordCount} />
    </label>
    <div class="options">
      <label class="field">
        <span>分隔符號</span>
        <select bind:value={words.separator}>
          <option value="-">連字號 -</option>
          <option value=".">句點 .</option>
          <option value="_">底線 _</option>
          <option value=" ">空白</option>
        </select>
      </label>
      <label class="check"><input type="checkbox" bind:checked={words.capitalize} /> 字首大寫</label>
      <label class="check"><input type="checkbox" bind:checked={words.addNumber} /> 結尾加一個數字</label>
    </div>
  {/if}

  {#if error}
    <p class="error-text">{error}</p>
  {/if}

  <div class="row">
    <button type="button" onclick={regenerate}>重新產生</button>
    <button type="button" class="btn-primary" disabled={!value} onclick={() => onuse(value)}>使用這組密碼</button>
  </div>
</div>

<style>
  .generator {
    display: grid;
    gap: 0.9rem;
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-m);
    background: var(--paper);
  }

  .modes {
    display: inline-flex;
    justify-self: start;
    border: 1px solid var(--line);
    border-radius: var(--radius-s);
    overflow: hidden;
  }

  .modes button {
    border: 0;
    border-radius: 0;
  }

  .modes button[aria-pressed='true'] {
    background: var(--indigo);
    color: var(--indigo-fg);
    font-weight: 600;
  }

  .preview {
    min-height: 2.6rem;
  }

  .options {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    gap: 0 1rem;
  }

  .options .wide {
    grid-column: 1 / -1;
  }

  code {
    font-family: var(--mono);
    color: var(--brass);
    font-weight: 700;
  }
</style>

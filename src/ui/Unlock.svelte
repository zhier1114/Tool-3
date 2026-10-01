<script lang="ts">
  import type { AppController } from '../app/controller.svelte';
  import { focusOnMount } from './actions';

  let { app, error }: { app: AppController; error?: string } = $props();

  let mode = $state<'password' | 'recovery'>('password');
  let secret = $state('');

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (secret && !app.busy) void app.unlock(mode, secret);
  }

  function toggleMode() {
    mode = mode === 'password' ? 'recovery' : 'password';
    secret = '';
  }
</script>

<main class="gate">
  <h1>密碼庫</h1>
  <p class="lead">
    {mode === 'password' ? '輸入主密碼解鎖。' : '輸入抄在紙上的 10 個英文字，字與字之間用空白隔開。'}
  </p>

  <form class="stack" onsubmit={submit}>
    {#if mode === 'password'}
      <label class="field">
        <span>主密碼</span>
        <input type="password" bind:value={secret} autocomplete="off" use:focusOnMount />
      </label>
    {:else}
      <label class="field">
        <span>救援碼</span>
        <textarea
          rows="3"
          bind:value={secret}
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          use:focusOnMount
        ></textarea>
      </label>
    {/if}
    {#if error}
      <p class="error-text" role="alert">{error}</p>
    {/if}
    <button class="btn-primary" type="submit" disabled={!secret || app.busy}>
      {app.busy ? '解鎖中…' : '解鎖'}
    </button>
  </form>

  <div class="row">
    <button class="btn-quiet" onclick={toggleMode}>
      {mode === 'password' ? '忘記主密碼？改用救援碼' : '改用主密碼'}
    </button>
    <button class="btn-quiet" onclick={() => app.signOut()}>登出 Google</button>
  </div>
</main>

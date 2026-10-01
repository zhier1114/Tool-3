<script lang="ts">
  import type { AppController } from '../app/controller.svelte';
  import type { QuickUnlockKind } from '../storage/quickUnlock';
  import { focusOnMount } from './actions';

  let { app, quick, error }: { app: AppController; quick: QuickUnlockKind | null; error?: string } = $props();

  let mode = $state<'password' | 'recovery'>('password');
  let secret = $state('');
  // 有快速解鎖時，主密碼表單預設收起。
  let showPasswordForm = $state(false);
  const formVisible = $derived(!quick || showPasswordForm);

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

  {#if quick}
    <p class="lead">
      {quick === 'biometric' ? '用 Face ID 或 Touch ID 解鎖。' : '這台裝置已記住，按一下就能解鎖。'}
    </p>
    <button class="btn-primary" disabled={app.busy} onclick={() => app.unlockQuick()}>
      {app.busy ? '解鎖中…' : quick === 'biometric' ? '用 Face ID 或 Touch ID 解鎖' : '解鎖'}
    </button>
    {#if error && !formVisible}
      <p class="error-text" role="alert">{error}</p>
    {/if}
  {:else}
    <p class="lead">
      {mode === 'password' ? '輸入主密碼解鎖。' : '輸入抄在紙上的 10 個英文字，字與字之間用空白隔開。'}
    </p>
  {/if}

  {#if formVisible}
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
      <button class={quick ? '' : 'btn-primary'} type="submit" disabled={!secret || app.busy}>
        {app.busy ? '解鎖中…' : '用' + (mode === 'password' ? '主密碼' : '救援碼') + '解鎖'}
      </button>
    </form>
  {/if}

  <div class="row">
    {#if quick && !showPasswordForm}
      <button class="btn-quiet" onclick={() => (showPasswordForm = true)}>改用主密碼</button>
    {:else}
      <button class="btn-quiet" onclick={toggleMode}>
        {mode === 'password' ? '忘記主密碼？改用救援碼' : '改用主密碼'}
      </button>
    {/if}
    <button class="btn-quiet" onclick={() => app.signOut()}>登出 Google</button>
  </div>
</main>

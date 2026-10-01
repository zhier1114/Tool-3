<script lang="ts">
  import type { AppController } from '../app/controller.svelte';
  import { generateRecoveryCode } from '../core/recoveryCode';
  import { focusOnMount } from './actions';
  import PasswordSetter from './PasswordSetter.svelte';
  import RecoveryCode from './RecoveryCode.svelte';

  let { app }: { app: AppController } = $props();

  type Task = 'password' | 'recovery' | 'export' | 'quick';
  const TASK_TITLES: Record<Task, string> = {
    password: '修改主密碼',
    recovery: '重新產生救援碼',
    export: '匯出明文 CSV',
    quick: '啟用快速解鎖',
  };

  let task = $state<Task | null>(null);
  let verified = $state(false);
  let current = $state('');
  let verifyError = $state('');
  let checking = $state(false);
  let newCode = $state('');
  let codeSaved = $state(false);
  let exported = $state(false);

  function begin(next: Task) {
    task = next;
    verified = false;
    current = '';
    verifyError = '';
    newCode = generateRecoveryCode();
    codeSaved = false;
    exported = false;
  }

  function close() {
    task = null;
    current = '';
  }

  async function verify(event: SubmitEvent) {
    event.preventDefault();
    checking = true;
    verified = await app.verify('password', current);
    current = '';
    verifyError = verified ? '' : '主密碼不正確';
    if (verified && task === 'quick') {
      await app.enableQuick(await app.preferredQuickKind());
      close();
    }
    checking = false;
  }

  async function changePassword(password: string) {
    if (await app.changeSecret('password', password)) close();
  }

  async function changeRecovery() {
    if (await app.changeSecret('recovery', newCode)) close();
  }

  function download() {
    const csv = app.exportCsv();
    if (!csv) return;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    const d = new Date();
    link.href = url;
    link.download = `密碼庫-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    exported = true;
  }
</script>

<section class="settings">
  <h2>設定</h2>

  {#if task}
    <div class="panel">
      <div class="panel-head">
        <h3>{TASK_TITLES[task]}</h3>
        <button class="btn-quiet" onclick={close}>取消</button>
      </div>

      {#if !verified}
        <form class="stack" onsubmit={verify}>
          <p class="muted">為了安全，請先輸入目前的主密碼。</p>
          <label class="field">
            <span>目前的主密碼</span>
            <input type="password" bind:value={current} autocomplete="off" use:focusOnMount />
          </label>
          {#if verifyError}<p class="error-text" role="alert">{verifyError}</p>{/if}
          <button class="btn-primary" type="submit" disabled={!current || checking}>
            {checking ? '確認中…' : '確認'}
          </button>
        </form>
      {:else if task === 'password'}
        <PasswordSetter submitLabel="更新主密碼" busy={app.busy} onsubmit={changePassword} />
      {:else if task === 'quick'}
        <p class="muted" role="status">正在啟用快速解鎖…</p>
      {:else if task === 'recovery'}
        <p class="muted">這是新的救援碼。確認更換後，舊的救援碼就不能再用了。</p>
        <RecoveryCode code={newCode} />
        <label class="check"><input type="checkbox" bind:checked={codeSaved} /> 我已經抄下新的救援碼</label>
        <button class="btn-primary" disabled={!codeSaved || app.busy} onclick={changeRecovery}>
          {app.busy ? '更新中…' : '確認更換救援碼'}
        </button>
      {:else}
        <p class="warning">
          匯出的檔案<strong>沒有加密</strong>，任何人打開都能看到所有密碼。請只在需要備份或搬家時使用，用完立刻刪除。
        </p>
        {#if exported}
          <p>已匯出。請記得刪除下載的檔案，並清空資源回收筒。</p>
        {:else}
          <button class="btn-primary" onclick={download}>下載 CSV</button>
        {/if}
      {/if}
    </div>
  {:else}
    <ul class="menu">
      <li>
        {#if app.quickKind}
          <p>快速解鎖：{app.quickKind === 'biometric' ? '已啟用 Face ID／Touch ID' : '已記住這台裝置'}</p>
          <button onclick={() => app.disableQuick()}>停用快速解鎖</button>
        {:else}
          <p>快速解鎖：未啟用</p>
          <button onclick={() => begin('quick')}>啟用快速解鎖</button>
          <p class="muted">iPhone／iPad 用 Face ID 或 Touch ID，其他裝置則記住這台裝置。</p>
        {/if}
      </li>
      <li>
        <button onclick={() => begin('password')}>修改主密碼</button>
      </li>
      <li>
        <button onclick={() => begin('recovery')}>重新產生救援碼</button>
        <p class="muted">救援碼可能被別人看到時使用。</p>
      </li>
      <li>
        <button onclick={() => begin('export')}>匯出明文 CSV</button>
        <p class="muted">備份或搬到其他工具時使用。</p>
      </li>
    </ul>

    <div class="row">
      <button onclick={() => app.lock()}>立即鎖定</button>
      <button class="btn-danger" onclick={() => app.signOut()}>登出 Google</button>
    </div>

    <p class="muted small">
      加密檔位於 Google 雲端硬碟的「PasswordVault/vault.enc」。閒置 5 分鐘，或切到其他 App 超過 1 分鐘，就會自動鎖定。
    </p>
  {/if}
</section>

<style>
  .settings {
    display: grid;
    gap: 1.25rem;
  }

  .menu {
    list-style: none;
    display: grid;
    gap: 1rem;
  }

  .menu li {
    display: grid;
    gap: 0.25rem;
    justify-items: start;
  }

  .menu .muted {
    font-size: 0.875rem;
  }

  .panel {
    display: grid;
    gap: 1rem;
    padding: 1.25rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-m);
    background: var(--surface);
  }

  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .warning {
    padding: 0.75rem 1rem;
    border-left: 4px solid var(--danger);
    background: var(--paper);
  }

  .small {
    font-size: 0.85rem;
  }
</style>

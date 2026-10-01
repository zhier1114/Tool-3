<script lang="ts">
  import { DRIVE_SCOPE, GOOGLE_CLIENT_ID, redirectUri } from './config';
  import { AuthSession, browserAuthEnv, type CompleteResult } from './storage/auth';
  import { GoogleDriveClient } from './storage/driveClient';

  const auth = new AuthSession(
    browserAuthEnv({ clientId: GOOGLE_CLIENT_ID, redirectUri: redirectUri(), scope: DRIVE_SCOPE }),
  );
  const callback: CompleteResult = auth.complete();
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  let token = $state(auth.current());
  let driveResult = $state('');
  const drive = new GoogleDriveClient(() => auth.current()?.value ?? null);

  function describeCallback(result: CompleteResult): string {
    if (result.status === 'none') return '無';
    if (result.status === 'ok') return '成功取得權杖';
    return `錯誤：${result.error}`;
  }

  async function testDrive() {
    driveResult = '查詢中…';
    try {
      const vault = await drive.findVault();
      driveResult = vault ? `成功：找到保險庫（版本 ${vault.version}）` : '成功：雲端尚未建立保險庫';
    } catch (e) {
      driveResult = `失敗：${(e as Error).message}`;
    }
  }

  function logout() {
    auth.logout();
    token = null;
    driveResult = '';
  }
</script>

<main>
  <h1>密碼管理工具</h1>
  <p class="muted">登入流程原型（第 0 步）</p>

  <dl>
    <dt>執行模式</dt>
    <dd>{standalone ? '主畫面 App（standalone）' : '瀏覽器分頁'}</dd>
    <dt>這次載入的登入回應</dt>
    <dd>{describeCallback(callback)}</dd>
    <dt>登入狀態</dt>
    <dd>
      {token ? `已登入，權杖於 ${new Date(token.expiresAt).toLocaleTimeString('zh-TW')} 到期` : '未登入'}
    </dd>
  </dl>

  <div class="actions">
    {#if token}
      <button class="primary" onclick={testDrive}>測試讀取 Google Drive</button>
      <button onclick={logout}>登出</button>
    {:else}
      <button class="primary" onclick={() => auth.begin('select_account')}>登入 Google</button>
      <button onclick={() => auth.begin('none')}>無聲重新登入</button>
    {/if}
  </div>

  {#if driveResult}
    <p class="result">{driveResult}</p>
  {/if}
</main>

<style>
  main {
    max-width: 32rem;
    margin: 0 auto;
    padding: 1.5rem 1rem;
  }
  h1 {
    margin: 0 0 0.25rem;
  }
  .muted {
    color: var(--muted);
    margin-top: 0;
  }
  dl {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
  }
  dt {
    color: var(--muted);
    font-size: 0.85rem;
  }
  dd {
    margin: 0 0 0.75rem;
  }
  dd:last-child {
    margin-bottom: 0;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .result {
    margin-top: 1rem;
  }
</style>

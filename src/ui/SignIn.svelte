<script lang="ts">
  import type { AppController } from '../app/controller.svelte';

  let { app, error }: { app: AppController; error?: string } = $props();
</script>

<main class="gate">
  <h1>密碼庫</h1>
  <p class="lead">
    帳號密碼加密後只存在你自己的 Google 雲端硬碟。解開它的主密碼只有你知道，Google 也看不到內容。
  </p>
  {#if error}
    <p class="error-text" role="alert">{error}</p>
  {/if}
  <button class="btn-primary" onclick={() => app.signIn()}>使用 Google 登入</button>
  <!-- 暫時：讓主畫面 App 也能進入 Face ID／Touch ID 測試頁，正式功能完成後移除。 -->
  <a class="muted" href="?prf-test">Face ID／Touch ID 測試頁（暫時）</a>
</main>

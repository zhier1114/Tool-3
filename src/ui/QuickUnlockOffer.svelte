<script lang="ts">
  import type { AppController } from '../app/controller.svelte';
  import type { QuickUnlockKind } from '../storage/quickUnlock';

  let { app, kind }: { app: AppController; kind: QuickUnlockKind } = $props();
</script>

<div class="overlay">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="offer-title">
    {#if kind === 'biometric'}
      <h2 id="offer-title">下次用 Face ID 或 Touch ID 解鎖？</h2>
      <p>
        啟用後，這台裝置就不用每次輸入主密碼。系統會詢問是否儲存「zhier1114.github.io」的通行金鑰，請按「繼續」，再驗證一次 Face ID 或 Touch ID。
      </p>
    {:else}
      <h2 id="offer-title">記住這台裝置？</h2>
      <p>
        記住之後，在這台裝置上按一下「解鎖」就能打開，不用輸入主密碼。能使用這台裝置的人也打得開，所以請只在自己的電腦上啟用。
      </p>
    {/if}
    <p class="muted">主密碼仍然要記住：換新裝置、修改主密碼或匯出時都會用到。之後可以在設定中隨時關閉。</p>
    <div class="row">
      <button class="btn-primary" onclick={() => app.acceptQuickOffer()}>
        {kind === 'biometric' ? '啟用 Face ID／Touch ID' : '記住這台裝置'}
      </button>
      <button onclick={() => app.declineQuickOffer()}>不用了</button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: rgb(10 14 26 / 0.55);
  }

  .dialog {
    width: min(28rem, 100%);
    display: grid;
    gap: 1rem;
    padding: 1.5rem;
    border-radius: var(--radius-m);
    background: var(--surface);
    border-top: 4px solid var(--brass);
  }
</style>

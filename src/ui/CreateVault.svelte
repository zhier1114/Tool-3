<script lang="ts">
  import type { AppController } from '../app/controller.svelte';
  import { generateRecoveryCode } from '../core/recoveryCode';
  import PasswordSetter from './PasswordSetter.svelte';
  import RecoveryCode from './RecoveryCode.svelte';

  let { app }: { app: AppController } = $props();

  const code = generateRecoveryCode();
  let step = $state<1 | 2>(1);
  let password = '';
  let saved = $state(false);
</script>

<main class="gate">
  <p class="step">步驟 {step}／2</p>
  {#if step === 1}
    <h1>設定主密碼</h1>
    <p class="lead">
      雲端硬碟裡還沒有保險庫。主密碼是解開所有密碼的唯一鑰匙，不會存在任何地方，忘記就無法找回，只能用下一步的救援碼。
    </p>
    <PasswordSetter
      submitLabel="下一步"
      onsubmit={(pw) => {
        password = pw;
        step = 2;
      }}
    />
  {:else}
    <h1>抄下救援碼</h1>
    <p class="lead">
      忘記主密碼時，可以用這 10 個英文字解鎖。請抄在紙上收好，不要拍照，也不要存在手機或電腦裡。這組救援碼只會顯示這一次。
    </p>
    <RecoveryCode {code} />
    <label class="check"><input type="checkbox" bind:checked={saved} /> 我已經抄下救援碼</label>
    <div class="row">
      <button onclick={() => (step = 1)} disabled={app.busy}>上一步</button>
      <button class="btn-primary" disabled={!saved || app.busy} onclick={() => app.create(password, code)}>
        {app.busy ? '建立中…' : '建立保險庫'}
      </button>
    </div>
  {/if}
</main>

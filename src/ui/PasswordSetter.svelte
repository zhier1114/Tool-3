<script lang="ts">
  import { estimateStrength } from '../core/strength';

  let {
    submitLabel,
    busy = false,
    onsubmit,
  }: { submitLabel: string; busy?: boolean; onsubmit: (password: string) => void } = $props();

  const LEVELS = ['很弱', '弱', '普通', '強', '很強'];

  let password = $state('');
  let confirm = $state('');
  let show = $state(false);

  const strength = $derived(estimateStrength(password));
  const mismatch = $derived(confirm.length > 0 && confirm !== password);
  const canSubmit = $derived(strength.acceptable && confirm === password && !busy);

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (canSubmit) onsubmit(password);
  }
</script>

<form class="stack" onsubmit={submit}>
  <label class="field">
    <span>主密碼</span>
    <input
      type={show ? 'text' : 'password'}
      bind:value={password}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
    />
  </label>

  <div class="meter" aria-hidden="true">
    {#each [0, 1, 2, 3, 4] as i (i)}
      <span class={`seg l${strength.level}`} class:on={password.length > 0 && i <= strength.level}></span>
    {/each}
  </div>
  <p class="hint" aria-live="polite">
    {#if password}
      強度：{LEVELS[strength.level]}{#if strength.reason}。{strength.reason}{/if}
    {:else}
      至少 12 個字元。建議用 4～5 個隨機詞語組成，例如「月亮-檯燈-咖啡-跑步-藍色」，好記又難猜。
    {/if}
  </p>

  <label class="field">
    <span>再輸入一次</span>
    <input type={show ? 'text' : 'password'} bind:value={confirm} autocomplete="off" autocapitalize="off" />
  </label>
  {#if mismatch}
    <p class="error-text">兩次輸入的主密碼不一樣</p>
  {/if}

  <label class="check"><input type="checkbox" bind:checked={show} /> 顯示密碼</label>

  <button class="btn-primary" type="submit" disabled={!canSubmit}>{busy ? '處理中…' : submitLabel}</button>
</form>

<style>
  .meter {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
    margin-top: -0.5rem;
  }

  .seg {
    height: 6px;
    border-radius: 3px;
    background: var(--line);
  }

  .seg.on.l0,
  .seg.on.l1 {
    background: var(--danger);
  }

  .seg.on.l2 {
    background: var(--brass);
  }

  .seg.on.l3,
  .seg.on.l4 {
    background: var(--indigo);
  }

  .hint {
    color: var(--ink-soft);
    font-size: 0.9rem;
    margin-top: -0.5rem;
  }
</style>

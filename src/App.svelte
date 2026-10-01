<script lang="ts">
  import type { AppController } from './app/controller.svelte';
  import Banner from './ui/Banner.svelte';
  import ConflictDialog from './ui/ConflictDialog.svelte';
  import CreateVault from './ui/CreateVault.svelte';
  import PasswordSetter from './ui/PasswordSetter.svelte';
  import QuickUnlockOffer from './ui/QuickUnlockOffer.svelte';
  import SignIn from './ui/SignIn.svelte';
  import Unlock from './ui/Unlock.svelte';
  import VaultScreen from './ui/VaultScreen.svelte';

  let { app }: { app: AppController } = $props();
  // svelte-ignore state_referenced_locally
  app.start();
</script>

<Banner {app} />

{#if app.screen.name === 'signin'}
  <SignIn {app} error={app.screen.error} />
{:else if app.screen.name === 'loading'}
  <main class="gate"><p class="muted" role="status">{app.screen.message}</p></main>
{:else if app.screen.name === 'error'}
  <main class="gate">
    <h1>密碼庫</h1>
    <p class="error-text" role="alert">{app.screen.message}</p>
    <button class="btn-primary" onclick={() => app.loadVault()}>重試</button>
  </main>
{:else if app.screen.name === 'create'}
  <CreateVault {app} />
{:else if app.screen.name === 'unlock'}
  <Unlock {app} quick={app.screen.quick} error={app.screen.error} />
{:else if app.screen.name === 'set-password'}
  <main class="gate">
    <h1>設定新的主密碼</h1>
    <p class="lead">你用救援碼解鎖了保險庫。請設定新的主密碼，舊的主密碼會失效。</p>
    <PasswordSetter submitLabel="設定主密碼" busy={app.busy} onsubmit={(pw) => app.setNewPassword(pw)} />
  </main>
{:else if app.data}
  <VaultScreen {app} data={app.data} />
{/if}

{#if app.quickOffer && app.screen.name === 'vault'}
  <QuickUnlockOffer {app} kind={app.quickOffer} />
{/if}

{#if app.conflicts}
  <ConflictDialog {app} conflicts={app.conflicts} />
{/if}

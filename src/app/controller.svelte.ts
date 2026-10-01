import { DRIVE_SCOPE, GOOGLE_CLIENT_ID, redirectUri } from '../config';
import { exportCsv } from '../core/csv';
import type { Conflict, Resolution } from '../core/merge';
import type { VaultData } from '../core/model';
import { WrongSecretError, type KeySlotType } from '../core/vaultFile';
import { AuthSession, browserAuthEnv } from '../storage/auth';
import { AuthExpiredError, GoogleDriveClient } from '../storage/driveClient';
import {
  createVault,
  locateVault,
  unlockVault,
  type ConflictResolver,
  type LockedVault,
  type UnlockedVault,
} from '../storage/syncService';
import { describeAuthError } from './authErrors';
import { AutoLock } from './autoLock';
import { ClipboardGuard } from './clipboard';
import { loadPrefs, savePrefs, type Prefs } from './prefs';

/** 解鎖時權杖至少要剩這麼久，否則先無聲更新（跳轉會清空記憶體，所以必須在解鎖前做）。 */
const UNLOCK_MIN_TOKEN_MS = 15 * 60_000;
/** 開啟編輯表單時權杖至少要剩這麼久，確保儲存時權杖仍有效。 */
const EDIT_MIN_TOKEN_MS = 10 * 60_000;
const BANNER_MS = 4000;
/** 曾經在這台裝置登入過，之後就自動無聲登入，不必每次都按按鈕。 */
const SIGNED_IN_KEY = 'pwvault.signedIn';

export type Screen =
  | { name: 'signin'; error?: string }
  | { name: 'loading'; message: string }
  | { name: 'error'; message: string }
  | { name: 'create' }
  | { name: 'unlock'; locked: LockedVault; error?: string }
  | { name: 'set-password' }
  | { name: 'vault' };

export interface Banner {
  kind: 'info' | 'error';
  text: string;
}

function errorMessage(e: unknown): string {
  if (e instanceof TypeError) return '無法連線到 Google Drive，請檢查網路';
  return e instanceof Error ? e.message : String(e);
}

export class AppController {
  screen = $state<Screen>({ name: 'loading', message: '正在連線…' });
  data = $state.raw<VaultData | null>(null);
  busy = $state(false);
  banner = $state<Banner | null>(null);
  conflicts = $state.raw<Conflict[] | null>(null);
  prefs = $state<Prefs>(loadPrefs(localStorage));
  clipboardSeconds = $state(0);

  private readonly auth = new AuthSession(
    browserAuthEnv({ clientId: GOOGLE_CLIENT_ID, redirectUri: redirectUri(), scope: DRIVE_SCOPE }),
  );
  private readonly drive = new GoogleDriveClient(() => this.auth.current()?.value ?? null);
  private vault: UnlockedVault | null = null;
  private conflictAnswer: ((answers: Record<string, Resolution>) => void) | null = null;
  private bannerTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly autoLock = new AutoLock(() => this.lock());
  private readonly clipboard = new ClipboardGuard({
    write: (text) => navigator.clipboard.writeText(text),
    canClear: () => document.visibilityState === 'visible' && document.hasFocus(),
    now: () => Date.now(),
  });

  constructor() {
    const activity = () => this.autoLock.activity();
    window.addEventListener('pointerdown', activity, { passive: true });
    window.addEventListener('keydown', activity);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.autoLock.hidden();
        return;
      }
      this.autoLock.visible();
      if (this.vault) void this.refresh();
    });
    setInterval(() => {
      this.autoLock.tick();
      void this.clipboard.tick().then(() => {
        this.clipboardSeconds = this.clipboard.remainingSeconds();
      });
    }, 1000);
  }

  // ── 登入 ──────────────────────────────────────────────

  start(): void {
    const result = this.auth.complete();
    if (result.status === 'ok') localStorage.setItem(SIGNED_IN_KEY, '1');
    if (result.status === 'error') {
      this.screen = { name: 'signin', error: describeAuthError(result.error) };
      return;
    }
    if (this.ensureToken(UNLOCK_MIN_TOKEN_MS)) void this.loadVault();
  }

  signIn(): void {
    this.auth.begin('select_account');
  }

  signOut(): void {
    this.lockInternal();
    this.auth.logout();
    localStorage.removeItem(SIGNED_IN_KEY);
    this.screen = { name: 'signin' };
  }

  /** 權杖足夠就回傳 true；否則開始無聲重新登入（整頁跳轉）或顯示登入畫面，回傳 false。 */
  private ensureToken(minMs: number): boolean {
    const token = this.auth.current();
    if (token && token.expiresAt - Date.now() >= minMs) return true;
    if (localStorage.getItem(SIGNED_IN_KEY)) {
      this.screen = { name: 'loading', message: '正在重新登入 Google…' };
      this.auth.begin('none');
    } else {
      this.screen = { name: 'signin' };
    }
    return false;
  }

  // ── 保險庫 ────────────────────────────────────────────

  async loadVault(): Promise<void> {
    this.screen = { name: 'loading', message: '正在讀取 Google 雲端硬碟…' };
    try {
      const locked = await locateVault(this.drive);
      this.screen = locked ? { name: 'unlock', locked } : { name: 'create' };
    } catch (e) {
      if (e instanceof AuthExpiredError) {
        this.auth.logout();
        if (this.ensureToken(UNLOCK_MIN_TOKEN_MS)) void this.loadVault();
        return;
      }
      this.screen = { name: 'error', message: errorMessage(e) };
    }
  }

  async create(password: string, recoveryCode: string): Promise<void> {
    await this.run(async () => {
      this.vault = await createVault(this.drive, password, recoveryCode);
      this.enterVault();
      this.showBanner('info', '保險庫已建立');
    });
  }

  async unlock(type: KeySlotType, secret: string): Promise<void> {
    if (this.screen.name !== 'unlock') return;
    const screen = this.screen;
    this.busy = true;
    try {
      this.vault = await unlockVault(this.drive, screen.locked, type, secret);
      if (type === 'recovery') {
        this.data = this.vault.data;
        this.autoLock.start();
        this.screen = { name: 'set-password' };
      } else {
        this.enterVault();
        void this.refresh();
      }
    } catch (e) {
      if (e instanceof WrongSecretError) {
        this.screen = { ...screen, error: type === 'password' ? '主密碼不正確' : '救援碼不正確' };
      } else {
        this.screen = { ...screen, error: errorMessage(e) };
      }
    } finally {
      this.busy = false;
    }
  }

  /** 以救援碼解鎖後設定新的主密碼。 */
  async setNewPassword(password: string): Promise<void> {
    if (await this.changeSecret('password', password)) this.enterVault();
  }

  private enterVault(): void {
    if (!this.vault) return;
    this.data = this.vault.data;
    this.screen = { name: 'vault' };
    this.autoLock.start();
  }

  /** 套用修改並同步。回傳 false 代表沒有套用（保險庫已鎖定）。上傳失敗時修改仍保留在本機。 */
  async mutate(fn: (data: VaultData, now: Date) => VaultData): Promise<boolean> {
    const vault = this.vault;
    if (!vault || vault.locked) return false;
    this.busy = true;
    try {
      const outcome = await vault.apply(fn, this.resolver);
      if (outcome.pulled) this.showBanner('info', '已合併其他裝置的更新');
    } catch (e) {
      this.showSyncError(e, '儲存失敗');
    } finally {
      if (!vault.locked) this.data = vault.data;
      this.busy = false;
    }
    return true;
  }

  async refresh(): Promise<void> {
    const vault = this.vault;
    if (!vault || vault.locked || this.busy || !this.auth.current()) return;
    this.busy = true;
    try {
      const outcome = await vault.sync(this.resolver);
      if (outcome.pulled) this.showBanner('info', '雲端有更新，已重新載入');
    } catch (e) {
      this.showSyncError(e, '同步失敗');
    } finally {
      if (!vault.locked) this.data = vault.data;
      this.busy = false;
    }
  }

  /** 開啟編輯表單前呼叫：權杖快過期時先鎖定並重新登入，避免填到一半無法儲存。 */
  requireFreshToken(): boolean {
    const token = this.auth.current();
    if (token && token.expiresAt - Date.now() >= EDIT_MIN_TOKEN_MS) return true;
    this.lockInternal();
    this.ensureToken(UNLOCK_MIN_TOKEN_MS);
    return false;
  }

  async verify(type: KeySlotType, secret: string): Promise<boolean> {
    return this.vault ? this.vault.verifySecret(type, secret) : false;
  }

  async changeSecret(type: KeySlotType, secret: string): Promise<boolean> {
    const vault = this.vault;
    if (!vault) return false;
    let ok = false;
    await this.run(async () => {
      await vault.changeSecret(type, secret, this.resolver);
      this.data = vault.data;
      this.showBanner('info', type === 'password' ? '主密碼已更新' : '救援碼已更新，舊的救援碼已失效');
      ok = true;
    });
    return ok;
  }

  exportCsv(): string | null {
    return this.vault && !this.vault.locked ? exportCsv(this.vault.data) : null;
  }

  lock(): void {
    this.lockInternal();
    if (this.ensureToken(UNLOCK_MIN_TOKEN_MS)) void this.loadVault();
  }

  private lockInternal(): void {
    this.vault?.lock();
    this.vault = null;
    this.data = null;
    this.conflicts = null;
    this.conflictAnswer = null;
    this.autoLock.stop();
  }

  // ── 衝突 ──────────────────────────────────────────────

  private readonly resolver: ConflictResolver = (conflicts) =>
    new Promise((resolve) => {
      this.conflicts = conflicts;
      this.conflictAnswer = resolve;
    });

  answerConflicts(answers: Record<string, Resolution>): void {
    const answer = this.conflictAnswer;
    this.conflictAnswer = null;
    this.conflicts = null;
    answer?.(answers);
  }

  // ── 其他 ──────────────────────────────────────────────

  async copy(text: string, label: string): Promise<void> {
    try {
      await this.clipboard.copy(text);
      this.clipboardSeconds = this.clipboard.remainingSeconds();
      this.showBanner('info', `已複製${label}`);
    } catch {
      this.showBanner('error', '無法使用剪貼簿，請手動選取複製');
    }
  }

  updatePrefs(changes: Partial<Prefs>): void {
    this.prefs = { ...$state.snapshot(this.prefs), ...changes };
    savePrefs(localStorage, $state.snapshot(this.prefs));
  }

  showBanner(kind: Banner['kind'], text: string): void {
    clearTimeout(this.bannerTimer);
    this.banner = { kind, text };
    if (kind === 'info') this.bannerTimer = setTimeout(() => (this.banner = null), BANNER_MS);
  }

  dismissBanner(): void {
    clearTimeout(this.bannerTimer);
    this.banner = null;
  }

  private showSyncError(e: unknown, action: string): void {
    if (e instanceof AuthExpiredError) {
      this.showBanner('error', `${action}：Google 登入已過期。請按「鎖定」後重新解鎖，再重做一次修改。`);
      return;
    }
    this.showBanner('error', `${action}：${errorMessage(e)}。修改仍保留在這台裝置，下次儲存時會一併上傳。`);
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.busy = true;
    try {
      await task();
    } catch (e) {
      this.showBanner('error', errorMessage(e));
    } finally {
      this.busy = false;
    }
  }
}

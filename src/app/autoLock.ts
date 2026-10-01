export interface AutoLockOptions {
  idleMs: number;
  backgroundMs: number;
}

export const DEFAULT_AUTO_LOCK: AutoLockOptions = { idleMs: 5 * 60_000, backgroundMs: 60_000 };

/** 純邏輯：由呼叫端轉送使用者活動、頁面可見性與定時 tick。 */
export class AutoLock {
  private active = false;
  private lastActivity = 0;
  private hiddenAt: number | null = null;

  constructor(
    private readonly onLock: () => void,
    private readonly options: AutoLockOptions = DEFAULT_AUTO_LOCK,
    private readonly now: () => number = () => Date.now(),
  ) {}

  start(): void {
    this.active = true;
    this.lastActivity = this.now();
    this.hiddenAt = null;
  }

  stop(): void {
    this.active = false;
  }

  activity(): void {
    this.lastActivity = this.now();
  }

  hidden(): void {
    this.hiddenAt = this.now();
  }

  visible(): void {
    const hiddenAt = this.hiddenAt;
    this.hiddenAt = null;
    if (hiddenAt !== null && this.now() - hiddenAt >= this.options.backgroundMs) this.fire();
    else this.activity();
  }

  tick(): void {
    if (this.now() - this.lastActivity >= this.options.idleMs) this.fire();
  }

  private fire(): void {
    if (!this.active) return;
    this.active = false;
    this.onLock();
  }
}

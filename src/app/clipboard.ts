export interface ClipboardEnv {
  write(text: string): Promise<void>;
  /** App 在前景且有焦點時才允許清除（瀏覽器限制）。 */
  canClear(): boolean;
  now(): number;
}

export const CLIPBOARD_CLEAR_MS = 30_000;

export class ClipboardGuard {
  private expiresAt: number | null = null;

  constructor(
    private readonly env: ClipboardEnv,
    private readonly durationMs = CLIPBOARD_CLEAR_MS,
  ) {}

  async copy(text: string): Promise<void> {
    await this.env.write(text);
    this.expiresAt = this.env.now() + this.durationMs;
  }

  remainingSeconds(): number {
    if (this.expiresAt === null) return 0;
    return Math.max(0, Math.ceil((this.expiresAt - this.env.now()) / 1000));
  }

  /** 倒數結束時清空剪貼簿；不在前景就放棄，以免清掉使用者在別處複製的內容。 */
  async tick(): Promise<void> {
    if (this.expiresAt === null || this.env.now() < this.expiresAt) return;
    this.expiresAt = null;
    if (!this.env.canClear()) return;
    try {
      await this.env.write('');
    } catch {
      // iOS 可能拒絕非使用者手勢觸發的寫入；這是已知限制。
    }
  }
}

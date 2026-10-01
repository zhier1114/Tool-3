import { DEFAULT_KDF, type KdfParams } from '../core/crypto';
import { mergeVaults, resolveConflicts, type Conflict, type Resolution } from '../core/merge';
import { cleanup, emptyVault, type VaultData } from '../core/model';
import {
  createVaultFile,
  parseVaultFile,
  readPayload,
  replaceKeySlot,
  serializeVaultFile,
  unlockVaultFile,
  writePayload,
  type KeySlotType,
  type VaultFile,
} from '../core/vaultFile';
import type { DriveClient } from './driveClient';

const MAX_SYNC_ATTEMPTS = 3;

/** 由 UI 實作：顯示衝突對照畫面，回傳每個衝突項目的選擇。 */
export type ConflictResolver = (conflicts: Conflict[]) => Promise<Record<string, Resolution>>;

export interface SyncOutcome {
  /** 是否從雲端拉下了別台裝置的修改。 */
  pulled: boolean;
  /** 是否上傳了本機的修改。 */
  pushed: boolean;
}

export interface LockedVault {
  fileId: string;
  version: string;
  file: VaultFile;
}

export class VaultLockedError extends Error {
  constructor() {
    super('保險庫已鎖定');
    this.name = 'VaultLockedError';
  }
}

type Clock = () => Date;
const systemClock: Clock = () => new Date();

export async function locateVault(drive: DriveClient): Promise<LockedVault | null> {
  const remote = await drive.findVault();
  if (!remote) return null;
  const { content, version } = await drive.download(remote.id);
  return { fileId: remote.id, version, file: parseVaultFile(content) };
}

export async function createVault(
  drive: DriveClient,
  password: string,
  recoveryCode: string,
  clock: Clock = systemClock,
  kdf: KdfParams = DEFAULT_KDF,
): Promise<UnlockedVault> {
  const data = emptyVault();
  const { file, dek } = await createVaultFile(data, password, recoveryCode, kdf);
  const remote = await drive.create(serializeVaultFile(file));
  return new UnlockedVault(drive, clock, remote.id, remote.version, file, dek, data);
}

export async function unlockVault(
  drive: DriveClient,
  locked: LockedVault,
  type: KeySlotType,
  secret: string,
  clock: Clock = systemClock,
): Promise<UnlockedVault> {
  const dek = await unlockVaultFile(locked.file, type, secret);
  const data = await readPayload(locked.file, dek);
  return new UnlockedVault(drive, clock, locked.fileId, locked.version, locked.file, dek, data);
}

function sameData(a: VaultData, b: VaultData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class UnlockedVault {
  private dek: CryptoKey | null;
  /** 最後一次與雲端一致的內容，作為三方合併的共同基準。 */
  private base: VaultData;
  private current: VaultData;

  constructor(
    private readonly drive: DriveClient,
    private readonly clock: Clock,
    readonly fileId: string,
    private baseVersion: string,
    private file: VaultFile,
    dek: CryptoKey,
    data: VaultData,
  ) {
    this.dek = dek;
    this.base = data;
    this.current = data;
  }

  get locked(): boolean {
    return this.dek === null;
  }

  get data(): VaultData {
    this.key();
    return this.current;
  }

  private key(): CryptoKey {
    if (!this.dek) throw new VaultLockedError();
    return this.dek;
  }

  /** 套用本機修改後立即同步。上傳失敗時修改仍保留在記憶體中，下次同步會一併送出。 */
  async apply(mutate: (data: VaultData, now: Date) => VaultData, resolve: ConflictResolver): Promise<SyncOutcome> {
    this.key();
    this.current = mutate(this.current, this.clock());
    return this.sync(resolve);
  }

  async sync(resolve: ConflictResolver): Promise<SyncOutcome> {
    this.key();
    let pulled = false;
    for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt++) {
      const remoteVersion = await this.drive.getVersion(this.fileId);
      if (remoteVersion !== this.baseVersion) {
        await this.pull(resolve);
        pulled = true;
        continue;
      }
      this.current = cleanup(this.current, this.clock());
      if (sameData(this.current, this.base)) return { pulled, pushed: false };
      await this.push(this.file);
      return { pulled, pushed: true };
    }
    throw new Error('雲端檔案持續變動中，請稍後再試');
  }

  /** 修改主密碼或救援碼。先同步確保內容最新，再以新的金鑰槽上傳。 */
  async changeSecret(type: KeySlotType, secret: string, resolve: ConflictResolver): Promise<void> {
    for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt++) {
      await this.sync(resolve);
      if ((await this.drive.getVersion(this.fileId)) !== this.baseVersion) continue;
      await this.push(await replaceKeySlot(this.file, this.key(), this.current, type, secret));
      return;
    }
    throw new Error('雲端檔案持續變動中，請稍後再試');
  }

  /** 釋放金鑰與明文資料的參照。JavaScript 無法保證記憶體立即被抹除。 */
  lock(): void {
    this.dek = null;
    this.base = emptyVault();
    this.current = emptyVault();
  }

  private async pull(resolve: ConflictResolver): Promise<void> {
    const dek = this.key();
    const { content, version } = await this.drive.download(this.fileId);
    // 別台裝置可能換過主密碼：DEK 不變，但標頭（金鑰槽）要改用雲端版本。
    const remoteFile = parseVaultFile(content);
    const remoteData = await readPayload(remoteFile, dek);
    const result = mergeVaults(this.base, this.current, remoteData);
    const merged = result.conflicts.length
      ? resolveConflicts(result, await resolve(result.conflicts), this.clock())
      : result.data;
    this.file = remoteFile;
    this.base = remoteData;
    this.baseVersion = version;
    this.current = merged;
  }

  /** 以 file 的標頭加密目前內容並上傳。 */
  private async push(file: VaultFile): Promise<void> {
    const sealed = await writePayload(file, this.key(), this.current);
    const remote = await this.drive.update(this.fileId, serializeVaultFile(sealed));
    this.file = sealed;
    this.base = this.current;
    this.baseVersion = remote.version;
  }
}

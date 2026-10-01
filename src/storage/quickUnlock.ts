import { DecryptionError, unwrapDataKey, type Encrypted } from '../core/crypto';
import { type Bytes, fromBase64, toBase64, utf8Encode } from '../core/encoding';
import { randomBytes } from '../core/random';
import type { KeyValueStore } from './auth';

/** biometric：Face ID 或 Touch ID（WebAuthn PRF）；device：記住這台裝置（IndexedDB 裡不可匯出的金鑰）。 */
export type QuickUnlockKind = 'biometric' | 'device';

export interface DeviceKeyStore {
  load(): Promise<CryptoKey | null>;
  save(key: CryptoKey): Promise<void>;
  clear(): Promise<void>;
}

export interface BiometricAuthenticator {
  isAvailable(): Promise<boolean>;
  /** 建立平台通行金鑰，回傳 credential ID。 */
  register(): Promise<Bytes>;
  /** 以 Face ID／Touch ID 驗證並取得 PRF 秘密值；裝置不支援 PRF 時回傳 null。使用者取消時丟出 NotAllowedError。 */
  evaluate(credentialId: Bytes, salt: Bytes): Promise<Bytes | null>;
}

export interface QuickUnlockDeps {
  records: KeyValueStore;
  keys: DeviceKeyStore;
  authenticator: BiometricAuthenticator;
  isAppleMobile: () => boolean;
}

interface StoredRecord {
  v: 1;
  kind: QuickUnlockKind;
  fileId: string;
  iv: string;
  wrapped: string;
  credentialId?: string;
  salt?: string;
}

export class PrfUnsupportedError extends Error {
  constructor() {
    super('這台裝置不支援用 Face ID 或 Touch ID 解鎖');
    this.name = 'PrfUnsupportedError';
  }
}

export class QuickUnlockFailedError extends Error {
  constructor() {
    super('快速解鎖已失效，請輸入主密碼');
    this.name = 'QuickUnlockFailedError';
  }
}

const RECORD_KEY = 'pwvault.quickUnlock';
const OFFERED_KEY = 'pwvault.quickUnlock.offered';
const HKDF_SALT = utf8Encode('pwvault-prf-v1');
const HKDF_INFO = utf8Encode('dek-wrap');
const PRF_SALT_BYTES = 32;

/** PRF 秘密值 → AES-GCM 包裝金鑰。 */
async function prfToKey(secret: Bytes): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: HKDF_INFO },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export class QuickUnlock {
  constructor(private readonly deps: QuickUnlockDeps) {}

  private read(): StoredRecord | null {
    try {
      const record = JSON.parse(this.deps.records.getItem(RECORD_KEY) ?? 'null') as StoredRecord | null;
      return record?.v === 1 ? record : null;
    } catch {
      return null;
    }
  }

  /** 這個保險庫在這台裝置上啟用的快速解鎖方式；沒有啟用時回傳 null。 */
  status(fileId: string): QuickUnlockKind | null {
    const record = this.read();
    return record && record.fileId === fileId ? record.kind : null;
  }

  async preferredKind(): Promise<QuickUnlockKind> {
    if (!this.deps.isAppleMobile()) return 'device';
    try {
      return (await this.deps.authenticator.isAvailable()) ? 'biometric' : 'device';
    } catch {
      return 'device';
    }
  }

  /** wrap 由已解鎖的保險庫提供（UnlockedVault.wrapDek），DEK 本身不經過這裡。 */
  async enable(kind: QuickUnlockKind, fileId: string, wrap: (kek: CryptoKey) => Promise<Encrypted>): Promise<void> {
    let kek: CryptoKey;
    const extra: Pick<StoredRecord, 'credentialId' | 'salt'> = {};
    if (kind === 'device') {
      kek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    } else {
      const credentialId = await this.deps.authenticator.register();
      const salt = randomBytes(PRF_SALT_BYTES);
      const secret = await this.deps.authenticator.evaluate(credentialId, salt);
      if (!secret) throw new PrfUnsupportedError();
      kek = await prfToKey(secret);
      extra.credentialId = toBase64(credentialId);
      extra.salt = toBase64(salt);
    }
    const wrapped = await wrap(kek);
    await this.disable();
    if (kind === 'device') await this.deps.keys.save(kek);
    const record: StoredRecord = {
      v: 1,
      kind,
      fileId,
      iv: toBase64(wrapped.iv),
      wrapped: toBase64(wrapped.ciphertext),
      ...extra,
    };
    this.deps.records.setItem(RECORD_KEY, JSON.stringify(record));
    this.markOffered(fileId);
  }

  /** 解開 DEK。紀錄或金鑰失效時自動停用並丟出 QuickUnlockFailedError；使用者取消驗證的錯誤原樣丟出。 */
  async unlock(fileId: string): Promise<CryptoKey> {
    const record = this.read();
    if (!record || record.fileId !== fileId) throw new QuickUnlockFailedError();

    let kek: CryptoKey | null = null;
    if (record.kind === 'device') {
      kek = await this.deps.keys.load();
    } else if (record.credentialId && record.salt) {
      const secret = await this.deps.authenticator.evaluate(fromBase64(record.credentialId), fromBase64(record.salt));
      kek = secret ? await prfToKey(secret) : null;
    }
    if (!kek) return this.fail();

    try {
      return await unwrapDataKey({ iv: fromBase64(record.iv), ciphertext: fromBase64(record.wrapped) }, kek);
    } catch (e) {
      if (e instanceof DecryptionError) return this.fail();
      throw e;
    }
  }

  /** 清除本機紀錄與裝置金鑰。iOS 上的通行金鑰無法由網頁刪除，會留在「設定 → 密碼」中，但已不再使用。 */
  async disable(): Promise<void> {
    this.deps.records.removeItem(RECORD_KEY);
    await this.deps.keys.clear();
  }

  wasOffered(fileId: string): boolean {
    return this.deps.records.getItem(OFFERED_KEY) === fileId;
  }

  markOffered(fileId: string): void {
    this.deps.records.setItem(OFFERED_KEY, fileId);
  }

  forgetOffer(): void {
    this.deps.records.removeItem(OFFERED_KEY);
  }

  private async fail(): Promise<never> {
    await this.disable();
    throw new QuickUnlockFailedError();
  }
}

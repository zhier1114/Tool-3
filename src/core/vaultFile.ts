import {
  DEFAULT_KDF,
  DecryptionError,
  type KdfParams,
  SALT_BYTES,
  decryptBytes,
  deriveKey,
  encryptBytes,
  generateDataKey,
  unwrapDataKey,
  wrapDataKey,
} from './crypto';
import { fromBase64, toBase64, utf8Decode, utf8Encode } from './encoding';
import type { VaultData } from './model';
import { randomBytes } from './random';
import { normalizeRecoveryCode } from './recoveryCode';

export type KeySlotType = 'password' | 'recovery';

export interface KeySlot {
  type: KeySlotType;
  salt: string;
  iv: string;
  wrappedKey: string;
}

export interface VaultFile {
  format: 'pwvault';
  formatVersion: 1;
  kdf: KdfParams;
  keySlots: KeySlot[];
  payload: { iv: string; ciphertext: string };
}

type VaultHeader = Omit<VaultFile, 'payload'>;

export class VaultFormatError extends Error {
  constructor(detail: string) {
    super(`保險庫檔案格式錯誤：${detail}`);
    this.name = 'VaultFormatError';
  }
}

export class WrongSecretError extends Error {
  constructor() {
    super('密碼或救援碼錯誤');
    this.name = 'WrongSecretError';
  }
}

function slotSecret(type: KeySlotType, secret: string): string {
  return type === 'recovery' ? normalizeRecoveryCode(secret) : secret;
}

async function makeSlot(type: KeySlotType, secret: string, dek: CryptoKey, kdf: KdfParams): Promise<KeySlot> {
  const salt = randomBytes(SALT_BYTES);
  const kek = await deriveKey(slotSecret(type, secret), salt, kdf);
  const wrapped = await wrapDataKey(dek, kek);
  return { type, salt: toBase64(salt), iv: toBase64(wrapped.iv), wrappedKey: toBase64(wrapped.ciphertext) };
}

/** 以固定欄位順序序列化標頭，作為 payload 加密的 AAD。 */
function headerAad(header: VaultHeader) {
  const canonical = {
    format: header.format,
    formatVersion: header.formatVersion,
    kdf: {
      alg: header.kdf.alg,
      memoryKiB: header.kdf.memoryKiB,
      iterations: header.kdf.iterations,
      parallelism: header.kdf.parallelism,
    },
    keySlots: header.keySlots.map((s) => ({ type: s.type, salt: s.salt, iv: s.iv, wrappedKey: s.wrappedKey })),
  };
  return utf8Encode(JSON.stringify(canonical));
}

function headerOf(file: VaultFile): VaultHeader {
  return { format: file.format, formatVersion: file.formatVersion, kdf: file.kdf, keySlots: file.keySlots };
}

async function seal(header: VaultHeader, dek: CryptoKey, data: VaultData): Promise<VaultFile> {
  const enc = await encryptBytes(dek, utf8Encode(JSON.stringify(data)), headerAad(header));
  return { ...header, payload: { iv: toBase64(enc.iv), ciphertext: toBase64(enc.ciphertext) } };
}

export async function createVaultFile(
  data: VaultData,
  password: string,
  recoveryCode: string,
  kdf: KdfParams = DEFAULT_KDF,
): Promise<{ file: VaultFile; dek: CryptoKey }> {
  const dek = await generateDataKey();
  const keySlots = [
    await makeSlot('password', password, dek, kdf),
    await makeSlot('recovery', recoveryCode, dek, kdf),
  ];
  const file = await seal({ format: 'pwvault', formatVersion: 1, kdf, keySlots }, dek, data);
  return { file, dek };
}

export async function unlockVaultFile(file: VaultFile, type: KeySlotType, secret: string): Promise<CryptoKey> {
  const slot = file.keySlots.find((s) => s.type === type);
  if (!slot) throw new VaultFormatError(`缺少 ${type} 金鑰槽`);
  const kek = await deriveKey(slotSecret(type, secret), fromBase64(slot.salt), file.kdf);
  try {
    return await unwrapDataKey({ iv: fromBase64(slot.iv), ciphertext: fromBase64(slot.wrappedKey) }, kek);
  } catch (e) {
    if (e instanceof DecryptionError) throw new WrongSecretError();
    throw e;
  }
}

export async function readPayload(file: VaultFile, dek: CryptoKey): Promise<VaultData> {
  let plaintext: Uint8Array;
  try {
    plaintext = await decryptBytes(
      dek,
      { iv: fromBase64(file.payload.iv), ciphertext: fromBase64(file.payload.ciphertext) },
      headerAad(headerOf(file)),
    );
  } catch (e) {
    if (e instanceof DecryptionError) throw new VaultFormatError('內容驗證失敗，檔案可能已被竄改或損毀');
    throw e;
  }
  const data = JSON.parse(utf8Decode(plaintext)) as VaultData;
  if (data?.schemaVersion !== 1 || !Array.isArray(data.entries) || !Array.isArray(data.tombstones)) {
    throw new VaultFormatError('不支援的資料版本');
  }
  return data;
}

export async function writePayload(file: VaultFile, dek: CryptoKey, data: VaultData): Promise<VaultFile> {
  return seal(headerOf(file), dek, data);
}

/** 以新的密碼或救援碼重新包裝 DEK。標頭改變後 AAD 也會變，所以 payload 要以同一把 DEK 重新加密。 */
export async function replaceKeySlot(
  file: VaultFile,
  dek: CryptoKey,
  data: VaultData,
  type: KeySlotType,
  secret: string,
): Promise<VaultFile> {
  const slot = await makeSlot(type, secret, dek, file.kdf);
  const keySlots = file.keySlots.map((s) => (s.type === type ? slot : s));
  return seal({ ...headerOf(file), keySlots }, dek, data);
}

export function serializeVaultFile(file: VaultFile): string {
  return JSON.stringify(file, null, 2);
}

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

function isBase64(value: unknown): value is string {
  return typeof value === 'string' && value.length % 4 === 0 && BASE64_RE.test(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseVaultFile(text: string): VaultFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new VaultFormatError('不是有效的 JSON');
  }
  if (!isRecord(raw) || raw.format !== 'pwvault') throw new VaultFormatError('不是保險庫檔案');
  if (raw.formatVersion !== 1) throw new VaultFormatError(`不支援的版本 ${String(raw.formatVersion)}`);

  const kdf = raw.kdf;
  if (
    !isRecord(kdf) ||
    kdf.alg !== 'argon2id' ||
    !isPositiveInt(kdf.memoryKiB) ||
    !isPositiveInt(kdf.iterations) ||
    !isPositiveInt(kdf.parallelism)
  ) {
    throw new VaultFormatError('KDF 參數無效');
  }

  if (!Array.isArray(raw.keySlots)) throw new VaultFormatError('缺少金鑰槽');
  const keySlots: KeySlot[] = raw.keySlots.map((s: unknown) => {
    if (
      !isRecord(s) ||
      (s.type !== 'password' && s.type !== 'recovery') ||
      !isBase64(s.salt) ||
      !isBase64(s.iv) ||
      !isBase64(s.wrappedKey)
    ) {
      throw new VaultFormatError('金鑰槽無效');
    }
    return { type: s.type, salt: s.salt, iv: s.iv, wrappedKey: s.wrappedKey };
  });
  if (!keySlots.some((s) => s.type === 'password')) throw new VaultFormatError('缺少主密碼金鑰槽');

  const payload = raw.payload;
  if (!isRecord(payload) || !isBase64(payload.iv) || !isBase64(payload.ciphertext)) {
    throw new VaultFormatError('內容區塊無效');
  }

  return {
    format: 'pwvault',
    formatVersion: 1,
    kdf: {
      alg: 'argon2id',
      memoryKiB: kdf.memoryKiB,
      iterations: kdf.iterations,
      parallelism: kdf.parallelism,
    },
    keySlots,
    payload: { iv: payload.iv, ciphertext: payload.ciphertext },
  };
}

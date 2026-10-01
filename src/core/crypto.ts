import { argon2id } from 'hash-wasm';
import { type Bytes, utf8Encode } from './encoding';
import { randomBytes } from './random';

export interface KdfParams {
  alg: 'argon2id';
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

/** 正式環境參數：64 MiB、3 次迭代，目標在 iPhone 上約 1 秒內完成。 */
export const DEFAULT_KDF: KdfParams = { alg: 'argon2id', memoryKiB: 65536, iterations: 3, parallelism: 1 };
export const SALT_BYTES = 16;
const IV_BYTES = 12;
const WRAP_AAD = utf8Encode('pwvault-dek-v1');

export class DecryptionError extends Error {
  constructor() {
    super('解密失敗：金鑰錯誤或資料已損毀');
    this.name = 'DecryptionError';
  }
}

export interface Encrypted {
  iv: Bytes;
  ciphertext: Bytes;
}

export async function deriveKey(secret: string, salt: Bytes, kdf: KdfParams): Promise<CryptoKey> {
  const hash = await argon2id({
    password: secret.normalize('NFC'),
    salt,
    parallelism: kdf.parallelism,
    iterations: kdf.iterations,
    memorySize: kdf.memoryKiB,
    hashLength: 32,
    outputType: 'binary',
  });
  const raw = new Uint8Array(hash);
  hash.fill(0);
  try {
    return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } finally {
    raw.fill(0);
  }
}

export async function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function encryptBytes(key: CryptoKey, plaintext: Bytes, aad: Bytes): Promise<Encrypted> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plaintext);
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

export async function decryptBytes(key: CryptoKey, enc: Encrypted, aad: Bytes): Promise<Bytes> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: enc.iv, additionalData: aad },
      key,
      enc.ciphertext,
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new DecryptionError();
  }
}

export async function wrapDataKey(dek: CryptoKey, kek: CryptoKey): Promise<Encrypted> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', dek));
  try {
    return await encryptBytes(kek, raw, WRAP_AAD);
  } finally {
    raw.fill(0);
  }
}

export async function unwrapDataKey(wrapped: Encrypted, kek: CryptoKey): Promise<CryptoKey> {
  const raw = await decryptBytes(kek, wrapped, WRAP_AAD);
  try {
    return await crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']);
  } finally {
    raw.fill(0);
  }
}

import { describe, expect, it } from 'vitest';
import {
  DecryptionError,
  decryptBytes,
  deriveKey,
  encryptBytes,
  generateDataKey,
  unwrapDataKey,
  wrapDataKey,
} from '../../src/core/crypto';
import { utf8Decode, utf8Encode } from '../../src/core/encoding';
import { randomBytes } from '../../src/core/random';
import { FAST_KDF } from '../helpers';

const AAD = utf8Encode('header');

describe('deriveKey', () => {
  it('derives the same key from the same secret and salt', async () => {
    const salt = randomBytes(16);
    const k1 = await deriveKey('correct horse', salt, FAST_KDF);
    const k2 = await deriveKey('correct horse', salt, FAST_KDF);
    const enc = await encryptBytes(k1, utf8Encode('secret'), AAD);
    expect(utf8Decode(await decryptBytes(k2, enc, AAD))).toBe('secret');
  });

  it('derives a different key from a different secret', async () => {
    const salt = randomBytes(16);
    const enc = await encryptBytes(await deriveKey('a-password', salt, FAST_KDF), utf8Encode('x'), AAD);
    const wrong = await deriveKey('b-password', salt, FAST_KDF);
    await expect(decryptBytes(wrong, enc, AAD)).rejects.toBeInstanceOf(DecryptionError);
  });

  it('derives a different key from a different salt', async () => {
    const enc = await encryptBytes(await deriveKey('pw', randomBytes(16), FAST_KDF), utf8Encode('x'), AAD);
    const wrong = await deriveKey('pw', randomBytes(16), FAST_KDF);
    await expect(decryptBytes(wrong, enc, AAD)).rejects.toBeInstanceOf(DecryptionError);
  });

  it('treats NFC and NFD forms of the same text as equal', async () => {
    const salt = randomBytes(16);
    const enc = await encryptBytes(await deriveKey('café', salt, FAST_KDF), utf8Encode('x'), AAD);
    const nfd = await deriveKey('café', salt, FAST_KDF);
    expect(utf8Decode(await decryptBytes(nfd, enc, AAD))).toBe('x');
  });
});

describe('encryptBytes / decryptBytes', () => {
  it('uses a fresh IV every time', async () => {
    const key = await generateDataKey();
    const a = await encryptBytes(key, utf8Encode('same'), AAD);
    const b = await encryptBytes(key, utf8Encode('same'), AAD);
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it('fails when the AAD differs', async () => {
    const key = await generateDataKey();
    const enc = await encryptBytes(key, utf8Encode('x'), AAD);
    await expect(decryptBytes(key, enc, utf8Encode('other'))).rejects.toBeInstanceOf(DecryptionError);
  });

  it('fails when the ciphertext is tampered with', async () => {
    const key = await generateDataKey();
    const enc = await encryptBytes(key, utf8Encode('x'), AAD);
    enc.ciphertext[0] ^= 1;
    await expect(decryptBytes(key, enc, AAD)).rejects.toBeInstanceOf(DecryptionError);
  });
});

describe('wrapDataKey / unwrapDataKey', () => {
  it('recovers a working data key', async () => {
    const kek = await deriveKey('pw', randomBytes(16), FAST_KDF);
    const dek = await generateDataKey();
    const enc = await encryptBytes(dek, utf8Encode('payload'), AAD);
    const unwrapped = await unwrapDataKey(await wrapDataKey(dek, kek), kek);
    expect(utf8Decode(await decryptBytes(unwrapped, enc, AAD))).toBe('payload');
  });

  it('fails with the wrong key-encryption key', async () => {
    const kek = await deriveKey('pw', randomBytes(16), FAST_KDF);
    const other = await deriveKey('other', randomBytes(16), FAST_KDF);
    const wrapped = await wrapDataKey(await generateDataKey(), kek);
    await expect(unwrapDataKey(wrapped, other)).rejects.toBeInstanceOf(DecryptionError);
  });
});

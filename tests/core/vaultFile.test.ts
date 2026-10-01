import { describe, expect, it } from 'vitest';
import { fromBase64, toBase64 } from '../../src/core/encoding';
import { generateRecoveryCode } from '../../src/core/recoveryCode';
import {
  VaultFormatError,
  WrongSecretError,
  createVaultFile,
  parseVaultFile,
  readPayload,
  replaceKeySlot,
  serializeVaultFile,
  unlockVaultFile,
  writePayload,
} from '../../src/core/vaultFile';
import { FAST_KDF, makeEntry, vaultOf } from '../helpers';

const PASSWORD = 'Correct-Horse-Battery-9';

async function setup() {
  const data = vaultOf(makeEntry());
  const recovery = generateRecoveryCode();
  const { file, dek } = await createVaultFile(data, PASSWORD, recovery, FAST_KDF);
  return { data, recovery, file, dek };
}

describe('createVaultFile / unlockVaultFile / readPayload', () => {
  it('round-trips through serialize, parse and unlock with the password', async () => {
    const { data, file } = await setup();
    const parsed = parseVaultFile(serializeVaultFile(file));
    const dek = await unlockVaultFile(parsed, 'password', PASSWORD);
    expect(await readPayload(parsed, dek)).toEqual(data);
  });

  it('unlocks with the recovery code regardless of case and separators', async () => {
    const { data, file, recovery } = await setup();
    const dek = await unlockVaultFile(file, 'recovery', recovery.toUpperCase().replaceAll(' ', ' - '));
    expect(await readPayload(file, dek)).toEqual(data);
  });

  it('rejects a wrong password', async () => {
    const { file } = await setup();
    await expect(unlockVaultFile(file, 'password', 'wrong-password')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('stores the KDF parameters in the file', async () => {
    const { file } = await setup();
    expect(file.kdf).toEqual(FAST_KDF);
    expect(file.keySlots.map((s) => s.type)).toEqual(['password', 'recovery']);
  });
});

describe('writePayload', () => {
  it('stores new data under a fresh IV and keeps the key slots', async () => {
    const { file, dek } = await setup();
    const next = vaultOf(makeEntry({ title: 'Changed' }));
    const written = await writePayload(file, dek, next);
    expect(written.payload.iv).not.toBe(file.payload.iv);
    expect(written.keySlots).toEqual(file.keySlots);
    expect(await readPayload(written, dek)).toEqual(next);
  });
});

describe('replaceKeySlot', () => {
  it('changes the password and keeps the recovery code working', async () => {
    const { data, file, dek, recovery } = await setup();
    const changed = await replaceKeySlot(file, dek, data, 'password', 'New-Password-Is-Long-42');
    await expect(unlockVaultFile(changed, 'password', PASSWORD)).rejects.toBeInstanceOf(WrongSecretError);
    const viaNew = await unlockVaultFile(changed, 'password', 'New-Password-Is-Long-42');
    expect(await readPayload(changed, viaNew)).toEqual(data);
    const viaRecovery = await unlockVaultFile(changed, 'recovery', recovery);
    expect(await readPayload(changed, viaRecovery)).toEqual(data);
  });

  it('replaces the recovery code', async () => {
    const { data, file, dek, recovery } = await setup();
    const newCode = generateRecoveryCode();
    const changed = await replaceKeySlot(file, dek, data, 'recovery', newCode);
    await expect(unlockVaultFile(changed, 'recovery', recovery)).rejects.toBeInstanceOf(WrongSecretError);
    const viaNew = await unlockVaultFile(changed, 'recovery', newCode);
    expect(await readPayload(changed, viaNew)).toEqual(data);
  });
});

describe('tamper detection', () => {
  it('detects a swapped key slot through the header AAD', async () => {
    const { file, dek } = await setup();
    const other = await createVaultFile(vaultOf(), 'Another-Password-77', generateRecoveryCode(), FAST_KDF);
    const tampered = {
      ...file,
      keySlots: file.keySlots.map((s) => (s.type === 'recovery' ? other.file.keySlots[1] : s)),
    };
    await expect(readPayload(tampered, dek)).rejects.toBeInstanceOf(VaultFormatError);
  });

  it('detects a modified payload', async () => {
    const { file, dek } = await setup();
    const bytes = fromBase64(file.payload.ciphertext);
    bytes[0] ^= 1;
    const tampered = { ...file, payload: { ...file.payload, ciphertext: toBase64(bytes) } };
    await expect(readPayload(tampered, dek)).rejects.toBeInstanceOf(VaultFormatError);
  });
});

describe('parseVaultFile', () => {
  it('rejects malformed files', async () => {
    const { file } = await setup();
    const bad: unknown[] = [
      'not json',
      { ...file, format: 'other' },
      { ...file, formatVersion: 2 },
      { ...file, payload: undefined },
      { ...file, kdf: { ...file.kdf, iterations: 0 } },
      { ...file, kdf: { ...file.kdf, alg: 'pbkdf2' } },
      { ...file, keySlots: [{ ...file.keySlots[0], salt: '***' }, file.keySlots[1]] },
      { ...file, keySlots: [file.keySlots[1]] },
      { ...file, keySlots: [{ ...file.keySlots[0], type: 'other' }, file.keySlots[1]] },
    ];
    for (const input of bad) {
      const text = typeof input === 'string' ? input : JSON.stringify(input);
      expect(() => parseVaultFile(text), text.slice(0, 60)).toThrow(VaultFormatError);
    }
  });
});

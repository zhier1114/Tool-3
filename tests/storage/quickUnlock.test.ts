import { describe, expect, it } from 'vitest';
import { decryptBytes, encryptBytes, generateDataKey, wrapDataKey } from '../../src/core/crypto';
import { type Bytes, utf8Decode, utf8Encode } from '../../src/core/encoding';
import {
  PrfUnsupportedError,
  QuickUnlock,
  QuickUnlockFailedError,
  type BiometricAuthenticator,
  type DeviceKeyStore,
} from '../../src/storage/quickUnlock';

class MemoryStore {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

class MemoryKeyStore implements DeviceKeyStore {
  key: CryptoKey | null = null;
  async load() {
    return this.key;
  }
  async save(key: CryptoKey) {
    this.key = key;
  }
  async clear() {
    this.key = null;
  }
}

class FakeAuthenticator implements BiometricAuthenticator {
  available = true;
  supportsPrf = true;
  evaluated: { credentialId: number[]; salt: number[] }[] = [];
  async isAvailable() {
    return this.available;
  }
  async register(): Promise<Bytes> {
    return new Uint8Array([1, 2, 3, 4]);
  }
  async evaluate(credentialId: Bytes, salt: Bytes): Promise<Bytes | null> {
    this.evaluated.push({ credentialId: [...credentialId], salt: [...salt] });
    if (!this.supportsPrf) return null;
    const input = new Uint8Array([...credentialId, ...salt]);
    return new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  }
}

const FILE = 'file-1';
const AAD = utf8Encode('test');

function setup(appleMobile = false) {
  const records = new MemoryStore();
  const keys = new MemoryKeyStore();
  const authenticator = new FakeAuthenticator();
  const quick = new QuickUnlock({ records, keys, authenticator, isAppleMobile: () => appleMobile });
  return { records, keys, authenticator, quick };
}

async function vaultKey() {
  const dek = await generateDataKey();
  const sample = await encryptBytes(dek, utf8Encode('secret data'), AAD);
  return { dek, sample, wrap: (kek: CryptoKey) => wrapDataKey(dek, kek) };
}

describe('preferredKind', () => {
  it('uses biometrics on Apple mobile devices with a platform authenticator', async () => {
    expect(await setup(true).quick.preferredKind()).toBe('biometric');
  });

  it('falls back to the device key when no platform authenticator is available', async () => {
    const t = setup(true);
    t.authenticator.available = false;
    expect(await t.quick.preferredKind()).toBe('device');
  });

  it('uses the device key on other platforms', async () => {
    expect(await setup(false).quick.preferredKind()).toBe('device');
  });
});

describe('device key', () => {
  it('unlocks the vault key after enabling', async () => {
    const t = setup();
    const v = await vaultKey();
    await t.quick.enable('device', FILE, v.wrap);
    expect(t.quick.status(FILE)).toBe('device');
    const dek = await t.quick.unlock(FILE);
    expect(utf8Decode(await decryptBytes(dek, v.sample, AAD))).toBe('secret data');
  });

  it('stores a non-extractable device key', async () => {
    const t = setup();
    await t.quick.enable('device', FILE, (await vaultKey()).wrap);
    expect(t.keys.key?.extractable).toBe(false);
  });
});

describe('biometric', () => {
  it('unlocks the vault key with the stored credential and salt', async () => {
    const t = setup(true);
    const v = await vaultKey();
    await t.quick.enable('biometric', FILE, v.wrap);
    expect(t.quick.status(FILE)).toBe('biometric');
    const dek = await t.quick.unlock(FILE);
    expect(utf8Decode(await decryptBytes(dek, v.sample, AAD))).toBe('secret data');
    const [atEnable, atUnlock] = t.authenticator.evaluated;
    expect(atUnlock).toEqual(atEnable);
    expect(atUnlock.salt).toHaveLength(32);
  });

  it('refuses to enable when the device does not support PRF', async () => {
    const t = setup(true);
    t.authenticator.supportsPrf = false;
    await expect(t.quick.enable('biometric', FILE, (await vaultKey()).wrap)).rejects.toBeInstanceOf(
      PrfUnsupportedError,
    );
    expect(t.quick.status(FILE)).toBeNull();
    expect(t.records.map.size).toBe(0);
  });

  it('disables itself when PRF stops returning a secret', async () => {
    const t = setup(true);
    await t.quick.enable('biometric', FILE, (await vaultKey()).wrap);
    t.authenticator.supportsPrf = false;
    await expect(t.quick.unlock(FILE)).rejects.toBeInstanceOf(QuickUnlockFailedError);
    expect(t.quick.status(FILE)).toBeNull();
  });
});

describe('status / disable / failures', () => {
  it('only reports the vault it was enabled for', async () => {
    const t = setup();
    await t.quick.enable('device', FILE, (await vaultKey()).wrap);
    expect(t.quick.status('other-file')).toBeNull();
    await expect(t.quick.unlock('other-file')).rejects.toBeInstanceOf(QuickUnlockFailedError);
  });

  it('disable removes the record and the device key', async () => {
    const t = setup();
    await t.quick.enable('device', FILE, (await vaultKey()).wrap);
    await t.quick.disable();
    expect(t.quick.status(FILE)).toBeNull();
    expect(t.keys.key).toBeNull();
  });

  it('disables itself when the stored record is tampered with', async () => {
    const t = setup();
    await t.quick.enable('device', FILE, (await vaultKey()).wrap);
    const record = JSON.parse(t.records.getItem('pwvault.quickUnlock')!);
    record.wrapped = btoa('garbage-garbage-garbage-garbage-garbage!!');
    t.records.setItem('pwvault.quickUnlock', JSON.stringify(record));
    await expect(t.quick.unlock(FILE)).rejects.toBeInstanceOf(QuickUnlockFailedError);
    expect(t.quick.status(FILE)).toBeNull();
  });

  it('returns an extractable key so the master password can still be changed', async () => {
    const t = setup();
    await t.quick.enable('device', FILE, (await vaultKey()).wrap);
    expect((await t.quick.unlock(FILE)).extractable).toBe(true);
  });
});

describe('offer tracking', () => {
  it('remembers that the offer was made for this vault', () => {
    const t = setup();
    expect(t.quick.wasOffered(FILE)).toBe(false);
    t.quick.markOffered(FILE);
    expect(t.quick.wasOffered(FILE)).toBe(true);
    expect(t.quick.wasOffered('other-file')).toBe(false);
  });

  it('enabling counts as having been offered', async () => {
    const t = setup();
    await t.quick.enable('device', FILE, (await vaultKey()).wrap);
    expect(t.quick.wasOffered(FILE)).toBe(true);
  });
});

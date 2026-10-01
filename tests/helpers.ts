import type { KdfParams } from '../src/core/crypto';
import type { Entry, VaultData } from '../src/core/model';

/** 測試用的低成本 Argon2id 參數，正式環境請用 DEFAULT_KDF。 */
export const FAST_KDF: KdfParams = { alg: 'argon2id', memoryKiB: 1024, iterations: 1, parallelism: 1 };

export function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'e1',
    title: 'GitHub',
    url: 'https://github.com',
    username: 'me@example.com',
    password: 'old-pass',
    notes: '',
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    passwordHistory: [],
    trashedAt: null,
    ...overrides,
  };
}

export function vaultOf(...entries: Entry[]): VaultData {
  return { schemaVersion: 1, entries, tombstones: [] };
}

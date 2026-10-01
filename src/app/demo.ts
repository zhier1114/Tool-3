// 只在開發模式（npm run dev，網址加上 ?demo）使用：不連 Google，資料存在記憶體，重新整理就消失。
import { QuickUnlock, type DeviceKeyStore } from '../storage/quickUnlock';
import { FakeDrive } from '../storage/fakeDrive';
import type { AuthPort } from './controller.svelte';

class MemoryStore {
  private map = new Map<string, string>();
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

export function demoDeps(): { auth: AuthPort; drive: FakeDrive; quick: QuickUnlock } {
  const auth: AuthPort = {
    complete: () => ({ status: 'none' }),
    current: () => ({ value: 'demo', expiresAt: Date.now() + 3_600_000 }),
    begin: () => {},
    logout: () => {},
  };
  let deviceKey: CryptoKey | null = null;
  const keys: DeviceKeyStore = {
    load: async () => deviceKey,
    save: async (key) => {
      deviceKey = key;
    },
    clear: async () => {
      deviceKey = null;
    },
  };
  const quick = new QuickUnlock({
    records: new MemoryStore(),
    keys,
    authenticator: {
      isAvailable: async () => false,
      register: async () => new Uint8Array(),
      evaluate: async () => null,
    },
    isAppleMobile: () => false,
  });
  return { auth, drive: new FakeDrive(), quick };
}

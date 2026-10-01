// 只在開發模式（npm run dev，網址加上 ?demo）使用：不連 Google，資料存在記憶體，重新整理就消失。
import { FakeDrive } from '../storage/fakeDrive';
import type { AuthPort } from './controller.svelte';

export function demoDeps(): { auth: AuthPort; drive: FakeDrive } {
  const auth: AuthPort = {
    complete: () => ({ status: 'none' }),
    current: () => ({ value: 'demo', expiresAt: Date.now() + 3_600_000 }),
    begin: () => {},
    logout: () => {},
  };
  return { auth, drive: new FakeDrive() };
}

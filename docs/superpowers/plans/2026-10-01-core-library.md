# 密碼管理工具：專案骨架與核心函式庫 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Svelte + TypeScript 專案骨架，並完成不依賴任何網路服務的核心函式庫（加密、檔案格式、資料模型、搜尋、三方合併、產生器、救援碼、強度估算、CSV 匯出），全部有單元測試。

**Architecture:** `src/core/` 只放純邏輯，不做任何 I/O；所有函式都是不可變更新，回傳新物件，資料沒有變動時回傳原物件。加密採 envelope encryption：Argon2id 推導 KEK、AES-256-GCM 包裝 DEK，payload 以 DEK 加密並以標頭作為 AAD。設計依據見 `docs/superpowers/specs/2026-10-01-password-vault-design.md`。

**Tech Stack:** TypeScript 6、Svelte 5、Vite 8、Vitest 5、hash-wasm（Argon2id）、WebCrypto（Node 24 與瀏覽器皆內建）。

**後續計畫（不在本計畫範圍）：** Google Drive 串接與同步（syncService）、UI、部署。

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `package.json`、`tsconfig.json`、`vite.config.ts`、`svelte.config.js`、`index.html` | 專案設定 |
| `src/main.ts`、`src/App.svelte` | 暫時的入口畫面，確認建置可行 |
| `scripts/build-wordlist.mjs` | 下載 EFF 字詞表、驗證 SHA-256 後產生 `wordlist.ts` |
| `src/core/encoding.ts` | Base64、UTF-8、`Bytes` 型別 |
| `src/core/random.ts` | 安全亂數位元組、無偏差的亂數整數 |
| `src/core/crypto.ts` | Argon2id 金鑰推導、AES-GCM 加解密、DEK 包裝 |
| `src/core/wordlist.ts` | 產生出來的字詞表（7772 字） |
| `src/core/recoveryCode.ts` | 救援碼的產生、正規化、驗證 |
| `src/core/model.ts` | 資料型別與 Entry 操作（新增、修改、密碼歷史、垃圾桶、清除） |
| `src/core/vaultFile.ts` | vault.enc 格式：建立、解鎖、讀寫 payload、換金鑰槽、解析與驗證 |
| `src/core/query.ts` | 搜尋與排序 |
| `src/core/merge.ts` | 三方合併與衝突解決 |
| `src/core/generator.ts` | 密碼與詞組產生器 |
| `src/core/strength.ts` | 主密碼強度估算 |
| `src/core/csv.ts` | 明文 CSV 匯出 |
| `tests/helpers.ts` | 測試用的快速 KDF 參數、建立假資料的輔助函式 |
| `tests/core/*.test.ts` | 各模組的單元測試 |

所有指令都在 `密碼管理工具/` 資料夾下執行。

---

### Task 1: 專案骨架

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `svelte.config.js`, `index.html`, `src/main.ts`, `src/App.svelte`

- [ ] **Step 1: 建立 `package.json`**

```json
{
  "name": "password-vault",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "svelte-check --tsconfig ./tsconfig.json"
  }
}
```

- [ ] **Step 2: 安裝套件**

```bash
npm install hash-wasm@^4.12.0
npm install -D svelte@^5.57.1 vite@^8.3.1 @sveltejs/vite-plugin-svelte@^7.3.1 vitest@^5.0.3 typescript@~6.0.3 svelte-check@^4.7.6 @tsconfig/svelte@^5.0.8
```

Expected: 產生 `package-lock.json` 與 `node_modules/`，沒有 peer dependency 錯誤。TypeScript 鎖在 6.x，因為 svelte-check 4.7 尚未支援 TypeScript 7。

- [ ] **Step 3: 建立 `tsconfig.json`**

```json
{
  "extends": "@tsconfig/svelte/tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowJs": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.svelte", "tests/**/*.ts", "vite.config.ts"]
}
```

- [ ] **Step 4: 建立 `svelte.config.js`**

```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
};
```

- [ ] **Step 5: 建立 `vite.config.ts`**

```ts
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  plugins: [svelte()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 6: 建立 `index.html`、`src/main.ts`、`src/App.svelte`**

`index.html`:
```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>密碼管理工具</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`:
```ts
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
```

`src/App.svelte`:
```svelte
<main>
  <h1>密碼管理工具</h1>
  <p>開發中</p>
</main>
```

- [ ] **Step 7: 驗證建置、型別檢查、測試框架**

```bash
npm run check
npm run build
npx vitest run --passWithNoTests
```

Expected: `svelte-check found 0 errors`；`dist/` 產生成功；vitest 顯示沒有測試檔但結束碼為 0。

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts svelte.config.js index.html src/main.ts src/App.svelte
git commit -m "chore: scaffold Svelte + TypeScript project"
```

---

### Task 2: encoding 與 random

**Files:**
- Create: `src/core/encoding.ts`, `src/core/random.ts`
- Test: `tests/core/encoding.test.ts`, `tests/core/random.test.ts`

- [ ] **Step 1: 寫失敗的測試**

`tests/core/encoding.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { fromBase64, toBase64, utf8Decode, utf8Encode } from '../../src/core/encoding';

describe('base64', () => {
  it('encodes a known value', () => {
    expect(toBase64(utf8Encode('hi'))).toBe('aGk=');
  });

  it('round-trips every byte value', () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it('round-trips empty input', () => {
    expect(fromBase64(toBase64(new Uint8Array()))).toEqual(new Uint8Array());
  });
});

describe('utf8', () => {
  it('round-trips non-ASCII text', () => {
    expect(utf8Decode(utf8Encode('密碼🔑'))).toBe('密碼🔑');
  });

  it('rejects invalid UTF-8', () => {
    expect(() => utf8Decode(new Uint8Array([0xff]))).toThrow();
  });
});
```

`tests/core/random.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { randomBytes, randomInt } from '../../src/core/random';

describe('randomBytes', () => {
  it('returns the requested length', () => {
    expect(randomBytes(16)).toHaveLength(16);
  });

  it('returns different values on each call', () => {
    expect(randomBytes(16)).not.toEqual(randomBytes(16));
  });
});

describe('randomInt', () => {
  it('stays within [0, max) and covers every value', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const n = randomInt(10);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(10);
      seen.add(n);
    }
    expect(seen.size).toBe(10);
  });

  it('returns 0 when max is 1', () => {
    expect(randomInt(1)).toBe(0);
  });

  it('rejects an invalid max', () => {
    expect(() => randomInt(0)).toThrow(RangeError);
    expect(() => randomInt(1.5)).toThrow(RangeError);
    expect(() => randomInt(2 ** 32 + 1)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/core/encoding.test.ts tests/core/random.test.ts`
Expected: FAIL，找不到模組 `../../src/core/encoding`

- [ ] **Step 3: 實作**

`src/core/encoding.ts`:
```ts
/** 底層為一般 ArrayBuffer 的位元組陣列（WebCrypto 接受的型別）。 */
export type Bytes = Uint8Array<ArrayBuffer>;

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function fromBase64(b64: string): Bytes {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function utf8Encode(text: string): Bytes {
  return new TextEncoder().encode(text) as Bytes;
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
```

`src/core/random.ts`:
```ts
import type { Bytes } from './encoding';

export function randomBytes(length: number): Bytes {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** 回傳 [0, max) 的均勻亂數整數，以拒絕取樣避免取餘數造成的偏差。 */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32) {
    throw new RangeError(`max 必須是 1 到 2^32 之間的整數：${max}`);
  }
  const limit = Math.floor(2 ** 32 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run tests/core/encoding.test.ts tests/core/random.test.ts`
Expected: PASS（10 tests）

- [ ] **Step 5: Commit**

```bash
git add src/core/encoding.ts src/core/random.ts tests/core/encoding.test.ts tests/core/random.test.ts
git commit -m "feat(core): add base64/utf8 encoding and secure random helpers"
```

---

### Task 3: crypto（Argon2id、AES-GCM、DEK 包裝）

**Files:**
- Create: `src/core/crypto.ts`, `tests/helpers.ts`
- Test: `tests/core/crypto.test.ts`

- [ ] **Step 1: 建立測試輔助檔 `tests/helpers.ts`**

```ts
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
```

註：`model.ts` 在 Task 6 才建立，`helpers.ts` 只引用其型別。Task 3～5 的測試不會用到 `makeEntry` 與 `vaultOf`，所以先建立一個只有型別的 `src/core/model.ts`（見 Step 2），Task 6 再補上實作。

- [ ] **Step 2: 建立 `src/core/model.ts` 的型別部分**

```ts
export interface PasswordHistoryItem {
  password: string;
  changedAt: string;
}

export interface Entry {
  id: string;
  title: string;
  url: string;
  username: string;
  password: string;
  notes: string;
  tags: string[];
  createdAt: string;
  /** 任何欄位變動都會更新，介面上顯示為「更新日期」。 */
  updatedAt: string;
  /** 最近的舊密碼，新的在前。 */
  passwordHistory: PasswordHistoryItem[];
  /** 非 null 代表在垃圾桶裡。 */
  trashedAt: string | null;
}

/** 永久刪除的紀錄，合併時用來判斷刪除。 */
export interface Tombstone {
  id: string;
  deletedAt: string;
}

export interface VaultData {
  schemaVersion: 1;
  entries: Entry[];
  tombstones: Tombstone[];
}
```

- [ ] **Step 3: 寫失敗的測試 `tests/core/crypto.test.ts`**

```ts
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
```

- [ ] **Step 4: 執行測試，確認失敗**

Run: `npx vitest run tests/core/crypto.test.ts`
Expected: FAIL，找不到模組 `../../src/core/crypto`

- [ ] **Step 5: 實作 `src/core/crypto.ts`**

```ts
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
```

DEK 設為可匯出（extractable），因為修改主密碼或救援碼時需要重新包裝它。KEK 不可匯出。

- [ ] **Step 6: 執行測試，確認通過**

Run: `npx vitest run tests/core/crypto.test.ts`
Expected: PASS（9 tests）

- [ ] **Step 7: Commit**

```bash
git add src/core/crypto.ts src/core/model.ts tests/helpers.ts tests/core/crypto.test.ts
git commit -m "feat(core): add Argon2id key derivation and AES-GCM envelope crypto"
```

---

### Task 4: 字詞表與救援碼

**Files:**
- Create: `scripts/build-wordlist.mjs`, `src/core/wordlist.ts`（由腳本產生）, `src/core/recoveryCode.ts`
- Test: `tests/core/wordlist.test.ts`, `tests/core/recoveryCode.test.ts`

- [ ] **Step 1: 建立 `scripts/build-wordlist.mjs`**

```js
// 下載 EFF Large Wordlist，驗證 SHA-256 後產生 src/core/wordlist.ts。
// 用法：node scripts/build-wordlist.mjs
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const SOURCE_URL = 'https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt';
const SHA256 = 'addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e';

const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`下載失敗：HTTP ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
const hash = createHash('sha256').update(buf).digest('hex');
if (hash !== SHA256) throw new Error(`SHA-256 不符：${hash}`);

// 排除含連字號的字（drop-down、t-shirt 等），讓救援碼可以用任何非字母字元分隔。
const words = buf
  .toString('utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => line.split('\t')[1])
  .filter((w) => /^[a-z]+$/.test(w));

const out =
  `// 由 scripts/build-wordlist.mjs 產生，請勿手動修改。\n` +
  `// 來源：EFF Large Wordlist（${SOURCE_URL}），已排除含連字號的字。\n` +
  `export const WORDS: readonly string[] = '${words.join(' ')}'.split(' ');\n`;
writeFileSync(new URL('../src/core/wordlist.ts', import.meta.url), out);
console.log(`已寫入 ${words.length} 個字`);
```

- [ ] **Step 2: 執行腳本產生字詞表**

Run: `node scripts/build-wordlist.mjs`
Expected: `已寫入 7772 個字`

- [ ] **Step 3: 寫失敗的測試**

`tests/core/wordlist.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { WORDS } from '../../src/core/wordlist';

describe('WORDS', () => {
  it('contains the EFF large list minus hyphenated words', () => {
    expect(WORDS).toHaveLength(7772);
  });

  it('contains only unique lowercase words', () => {
    expect(WORDS.every((w) => /^[a-z]+$/.test(w))).toBe(true);
    expect(new Set(WORDS).size).toBe(WORDS.length);
  });
});
```

`tests/core/recoveryCode.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  RECOVERY_WORD_COUNT,
  generateRecoveryCode,
  isValidRecoveryCode,
  normalizeRecoveryCode,
} from '../../src/core/recoveryCode';
import { WORDS } from '../../src/core/wordlist';

describe('generateRecoveryCode', () => {
  it('produces the expected number of words from the wordlist', () => {
    const words = generateRecoveryCode().split(' ');
    expect(words).toHaveLength(RECOVERY_WORD_COUNT);
    expect(words.every((w) => WORDS.includes(w))).toBe(true);
  });

  it('produces a different code each time', () => {
    expect(generateRecoveryCode()).not.toBe(generateRecoveryCode());
  });
});

describe('normalizeRecoveryCode', () => {
  it('lowercases and accepts any non-letter separator', () => {
    expect(normalizeRecoveryCode('  Abacus-ZOOM\tzoology,　abdomen ')).toBe('abacus zoom zoology abdomen');
  });
});

describe('isValidRecoveryCode', () => {
  it('accepts a generated code in messy formatting', () => {
    const code = generateRecoveryCode();
    expect(isValidRecoveryCode(code.toUpperCase().replaceAll(' ', ' - '))).toBe(true);
  });

  it('rejects a code with an unknown word', () => {
    const words = generateRecoveryCode().split(' ');
    words[3] = 'notaword';
    expect(isValidRecoveryCode(words.join(' '))).toBe(false);
  });

  it('rejects a code with the wrong number of words', () => {
    const words = generateRecoveryCode().split(' ');
    expect(isValidRecoveryCode(words.slice(1).join(' '))).toBe(false);
    expect(isValidRecoveryCode('')).toBe(false);
  });
});
```

- [ ] **Step 4: 執行測試，確認 recoveryCode 失敗**

Run: `npx vitest run tests/core/wordlist.test.ts tests/core/recoveryCode.test.ts`
Expected: wordlist PASS；recoveryCode FAIL，找不到模組

- [ ] **Step 5: 實作 `src/core/recoveryCode.ts`**

```ts
import { randomInt } from './random';
import { WORDS } from './wordlist';

/** 10 個字 × log2(7772) ≈ 129 bits。 */
export const RECOVERY_WORD_COUNT = 10;
const WORD_SET = new Set(WORDS);

export function generateRecoveryCode(): string {
  return Array.from({ length: RECOVERY_WORD_COUNT }, () => WORDS[randomInt(WORDS.length)]).join(' ');
}

/** 轉小寫，任何非 a-z 的字元都視為分隔符號。 */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
    .join(' ');
}

export function isValidRecoveryCode(input: string): boolean {
  const words = normalizeRecoveryCode(input).split(' ');
  return words.length === RECOVERY_WORD_COUNT && words.every((w) => WORD_SET.has(w));
}
```

- [ ] **Step 6: 執行測試，確認通過**

Run: `npx vitest run tests/core/wordlist.test.ts tests/core/recoveryCode.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 7: Commit**

```bash
git add scripts/build-wordlist.mjs src/core/wordlist.ts src/core/recoveryCode.ts tests/core/wordlist.test.ts tests/core/recoveryCode.test.ts
git commit -m "feat(core): add EFF wordlist and recovery code generation"
```

---

### Task 5: vaultFile（加密檔格式）

**Files:**
- Create: `src/core/vaultFile.ts`
- Test: `tests/core/vaultFile.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```ts
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
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/core/vaultFile.test.ts`
Expected: FAIL，找不到模組 `../../src/core/vaultFile`

- [ ] **Step 3: 實作 `src/core/vaultFile.ts`**

```ts
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
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run tests/core/vaultFile.test.ts`
Expected: PASS（10 tests）

- [ ] **Step 5: Commit**

```bash
git add src/core/vaultFile.ts tests/core/vaultFile.test.ts
git commit -m "feat(core): add encrypted vault file format with password and recovery slots"
```

---

### Task 6: model（Entry 操作）

**Files:**
- Modify: `src/core/model.ts`（在 Task 3 建立的型別之後加入函式）
- Test: `tests/core/model.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```ts
import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  activeEntries,
  addEntry,
  allTags,
  cleanup,
  daysLeftInTrash,
  emptyVault,
  purgeEntry,
  restoreEntry,
  trashEntry,
  trashedEntries,
  updateEntry,
} from '../../src/core/model';
import { makeEntry, vaultOf } from '../helpers';

const NOW = new Date('2026-10-01T00:00:00.000Z');
const LATER = new Date('2026-10-02T00:00:00.000Z');
const DAY = 86_400_000;
const daysBefore = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

describe('addEntry', () => {
  it('creates a trimmed entry with normalized tags', () => {
    const before = emptyVault();
    const { data, entry } = addEntry(
      before,
      {
        title: ' GitHub ',
        url: ' https://github.com ',
        username: 'me',
        password: 'p1',
        notes: 'n',
        tags: ['work', ' work ', '', 'dev'],
      },
      NOW,
      'id-1',
    );
    expect(entry).toEqual({
      id: 'id-1',
      title: 'GitHub',
      url: 'https://github.com',
      username: 'me',
      password: 'p1',
      notes: 'n',
      tags: ['work', 'dev'],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      passwordHistory: [],
      trashedAt: null,
    });
    expect(data.entries).toEqual([entry]);
    expect(before.entries).toEqual([]);
  });
});

describe('updateEntry', () => {
  it('updates fields and bumps updatedAt', () => {
    const data = updateEntry(vaultOf(makeEntry()), 'e1', { title: 'New' }, LATER);
    expect(data.entries[0].title).toBe('New');
    expect(data.entries[0].updatedAt).toBe(LATER.toISOString());
  });

  it('returns the same object when nothing changes', () => {
    const before = vaultOf(makeEntry());
    expect(updateEntry(before, 'e1', { title: 'GitHub', tags: [] }, LATER)).toBe(before);
  });

  it('moves the old password into history', () => {
    const data = updateEntry(vaultOf(makeEntry()), 'e1', { password: 'new-pass' }, LATER);
    expect(data.entries[0].password).toBe('new-pass');
    expect(data.entries[0].passwordHistory).toEqual([{ password: 'old-pass', changedAt: LATER.toISOString() }]);
  });

  it('does not record an empty previous password', () => {
    const data = updateEntry(vaultOf(makeEntry({ password: '' })), 'e1', { password: 'first' }, LATER);
    expect(data.entries[0].passwordHistory).toEqual([]);
  });

  it('keeps at most HISTORY_LIMIT old passwords, newest first', () => {
    let data = vaultOf(makeEntry({ password: 'p0' }));
    for (let i = 1; i <= HISTORY_LIMIT + 2; i++) {
      data = updateEntry(data, 'e1', { password: `p${i}` }, new Date(NOW.getTime() + i * 1000));
    }
    const history = data.entries[0].passwordHistory;
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0].password).toBe(`p${HISTORY_LIMIT + 1}`);
    expect(history[HISTORY_LIMIT - 1].password).toBe('p2');
  });

  it('throws for an unknown id', () => {
    expect(() => updateEntry(vaultOf(), 'missing', { title: 'x' }, NOW)).toThrow();
  });
});

describe('trash', () => {
  it('moves an entry to the trash and back', () => {
    const trashed = trashEntry(vaultOf(makeEntry()), 'e1', NOW);
    expect(trashed.entries[0].trashedAt).toBe(NOW.toISOString());
    expect(trashed.entries[0].updatedAt).toBe(NOW.toISOString());
    expect(activeEntries(trashed)).toEqual([]);
    expect(trashedEntries(trashed)).toHaveLength(1);

    const restored = restoreEntry(trashed, 'e1', LATER);
    expect(restored.entries[0].trashedAt).toBeNull();
    expect(restored.entries[0].updatedAt).toBe(LATER.toISOString());
    expect(activeEntries(restored)).toHaveLength(1);
  });

  it('purgeEntry removes the entry and leaves a tombstone', () => {
    const data = purgeEntry(vaultOf(makeEntry()), 'e1', NOW);
    expect(data.entries).toEqual([]);
    expect(data.tombstones).toEqual([{ id: 'e1', deletedAt: NOW.toISOString() }]);
  });

  it('daysLeftInTrash counts down from 30', () => {
    expect(daysLeftInTrash(makeEntry({ trashedAt: NOW.toISOString() }), NOW)).toBe(30);
    expect(daysLeftInTrash(makeEntry({ trashedAt: daysBefore(29.5) }), NOW)).toBe(1);
    expect(daysLeftInTrash(makeEntry({ trashedAt: daysBefore(31) }), NOW)).toBe(0);
  });
});

describe('cleanup', () => {
  it('purges entries trashed 30+ days ago and drops tombstones older than 365 days', () => {
    const data = {
      schemaVersion: 1 as const,
      entries: [
        makeEntry({ id: 'old', trashedAt: daysBefore(30) }),
        makeEntry({ id: 'recent', trashedAt: daysBefore(29) }),
        makeEntry({ id: 'active' }),
      ],
      tombstones: [
        { id: 't-old', deletedAt: daysBefore(366) },
        { id: 't-new', deletedAt: daysBefore(364) },
      ],
    };
    const result = cleanup(data, NOW);
    expect(result.entries.map((e) => e.id)).toEqual(['recent', 'active']);
    expect(result.tombstones).toEqual([
      { id: 't-new', deletedAt: daysBefore(364) },
      { id: 'old', deletedAt: NOW.toISOString() },
    ]);
  });

  it('returns the same object when there is nothing to clean', () => {
    const data = vaultOf(makeEntry());
    expect(cleanup(data, NOW)).toBe(data);
  });
});

describe('allTags', () => {
  it('lists unique tags of active entries, sorted', () => {
    const data = vaultOf(
      makeEntry({ id: 'a', tags: ['work', 'dev'] }),
      makeEntry({ id: 'b', tags: ['bank', 'work'] }),
      makeEntry({ id: 'c', tags: ['hidden'], trashedAt: NOW.toISOString() }),
    );
    expect(allTags(data)).toEqual(['bank', 'dev', 'work']);
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/core/model.test.ts`
Expected: FAIL，`addEntry` 等函式未匯出

- [ ] **Step 3: 在 `src/core/model.ts` 檔尾加入實作**

```ts
export type EntryFields = Pick<Entry, 'title' | 'url' | 'username' | 'password' | 'notes' | 'tags'>;

export const HISTORY_LIMIT = 10;
export const TRASH_RETENTION_DAYS = 30;
export const TOMBSTONE_RETENTION_DAYS = 365;
const DAY_MS = 86_400_000;

export function emptyVault(): VaultData {
  return { schemaVersion: 1, entries: [], tombstones: [] };
}

export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const t = tag.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export function addEntry(
  data: VaultData,
  fields: EntryFields,
  now: Date,
  id: string = crypto.randomUUID(),
): { data: VaultData; entry: Entry } {
  const ts = now.toISOString();
  const entry: Entry = {
    id,
    title: fields.title.trim(),
    url: fields.url.trim(),
    username: fields.username,
    password: fields.password,
    notes: fields.notes,
    tags: normalizeTags(fields.tags),
    createdAt: ts,
    updatedAt: ts,
    passwordHistory: [],
    trashedAt: null,
  };
  return { data: { ...data, entries: [...data.entries, entry] }, entry };
}

/** 套用 fn 到指定項目；fn 回傳原物件代表沒有變動，此時整份資料也回傳原物件。 */
function mapEntry(data: VaultData, id: string, fn: (e: Entry) => Entry): VaultData {
  const index = data.entries.findIndex((e) => e.id === id);
  if (index < 0) throw new Error(`找不到項目：${id}`);
  const current = data.entries[index];
  const next = fn(current);
  if (next === current) return data;
  const entries = data.entries.slice();
  entries[index] = next;
  return { ...data, entries };
}

export function updateEntry(data: VaultData, id: string, changes: Partial<EntryFields>, now: Date): VaultData {
  return mapEntry(data, id, (e) => {
    const ts = now.toISOString();
    const next: Entry = { ...e };
    if (changes.title !== undefined) next.title = changes.title.trim();
    if (changes.url !== undefined) next.url = changes.url.trim();
    if (changes.username !== undefined) next.username = changes.username;
    if (changes.notes !== undefined) next.notes = changes.notes;
    if (changes.tags !== undefined) next.tags = normalizeTags(changes.tags);
    if (changes.password !== undefined && changes.password !== e.password) {
      next.password = changes.password;
      if (e.password) {
        next.passwordHistory = [{ password: e.password, changedAt: ts }, ...e.passwordHistory].slice(0, HISTORY_LIMIT);
      }
    }
    const changed =
      next.title !== e.title ||
      next.url !== e.url ||
      next.username !== e.username ||
      next.password !== e.password ||
      next.notes !== e.notes ||
      JSON.stringify(next.tags) !== JSON.stringify(e.tags);
    if (!changed) return e;
    next.updatedAt = ts;
    return next;
  });
}

export function trashEntry(data: VaultData, id: string, now: Date): VaultData {
  return mapEntry(data, id, (e) => {
    if (e.trashedAt) return e;
    const ts = now.toISOString();
    return { ...e, trashedAt: ts, updatedAt: ts };
  });
}

export function restoreEntry(data: VaultData, id: string, now: Date): VaultData {
  return mapEntry(data, id, (e) => (e.trashedAt ? { ...e, trashedAt: null, updatedAt: now.toISOString() } : e));
}

export function purgeEntry(data: VaultData, id: string, now: Date): VaultData {
  if (!data.entries.some((e) => e.id === id)) throw new Error(`找不到項目：${id}`);
  return {
    ...data,
    entries: data.entries.filter((e) => e.id !== id),
    tombstones: [...data.tombstones, { id, deletedAt: now.toISOString() }],
  };
}

export function daysLeftInTrash(entry: Entry, now: Date): number {
  if (!entry.trashedAt) return TRASH_RETENTION_DAYS;
  const expires = Date.parse(entry.trashedAt) + TRASH_RETENTION_DAYS * DAY_MS;
  return Math.max(0, Math.ceil((expires - now.getTime()) / DAY_MS));
}

/** 清除放進垃圾桶超過 30 天的項目，以及超過 365 天的 tombstone。 */
export function cleanup(data: VaultData, now: Date): VaultData {
  const trashCutoff = now.getTime() - TRASH_RETENTION_DAYS * DAY_MS;
  const tombstoneCutoff = now.getTime() - TOMBSTONE_RETENTION_DAYS * DAY_MS;
  const expired = data.entries.filter((e) => e.trashedAt && Date.parse(e.trashedAt) <= trashCutoff);
  const keptTombstones = data.tombstones.filter((t) => Date.parse(t.deletedAt) >= tombstoneCutoff);
  if (expired.length === 0 && keptTombstones.length === data.tombstones.length) return data;
  const ts = now.toISOString();
  const expiredIds = new Set(expired.map((e) => e.id));
  return {
    ...data,
    entries: data.entries.filter((e) => !expiredIds.has(e.id)),
    tombstones: [...keptTombstones, ...expired.map((e) => ({ id: e.id, deletedAt: ts }))],
  };
}

export function activeEntries(data: VaultData): Entry[] {
  return data.entries.filter((e) => !e.trashedAt);
}

export function trashedEntries(data: VaultData): Entry[] {
  return data.entries.filter((e) => e.trashedAt);
}

export function allTags(data: VaultData): string[] {
  const tags = new Set(activeEntries(data).flatMap((e) => e.tags));
  return [...tags].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run tests/core/model.test.ts`
Expected: PASS（13 tests）

- [ ] **Step 5: Commit**

```bash
git add src/core/model.ts tests/core/model.test.ts
git commit -m "feat(core): add entry operations with password history and trash"
```

---

### Task 7: query（搜尋與排序）

**Files:**
- Create: `src/core/query.ts`
- Test: `tests/core/query.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```ts
import { describe, expect, it } from 'vitest';
import { searchEntries, sortEntries } from '../../src/core/query';
import { makeEntry } from '../helpers';

const entries = [
  makeEntry({ id: 'gh', title: 'GitHub', url: 'https://github.com', username: 'dev@mail.com', tags: ['work'], updatedAt: '2026-03-01T00:00:00.000Z' }),
  makeEntry({ id: 'bank', title: '玉山銀行', url: 'https://esunbank.com', username: 'A123', tags: ['bank'], updatedAt: '2026-05-01T00:00:00.000Z' }),
  makeEntry({ id: 'steam', title: 'Steam', url: 'https://store.steampowered.com', username: 'gamer', tags: ['game', 'work'], updatedAt: '2026-01-01T00:00:00.000Z' }),
];
const ids = (list: { id: string }[]) => list.map((e) => e.id);

describe('searchEntries', () => {
  it('returns everything for an empty query', () => {
    expect(ids(searchEntries(entries, '  '))).toEqual(['gh', 'bank', 'steam']);
  });

  it('matches title, url, username and tags case-insensitively', () => {
    expect(ids(searchEntries(entries, 'github'))).toEqual(['gh']);
    expect(ids(searchEntries(entries, 'ESUN'))).toEqual(['bank']);
    expect(ids(searchEntries(entries, 'gamer'))).toEqual(['steam']);
    expect(ids(searchEntries(entries, 'game'))).toEqual(['steam']);
    expect(ids(searchEntries(entries, '銀行'))).toEqual(['bank']);
  });

  it('requires every term to match', () => {
    expect(ids(searchEntries(entries, 'work steam'))).toEqual(['steam']);
  });

  it('does not search passwords or notes', () => {
    const secret = [makeEntry({ id: 'x', password: 'needle', notes: 'needle' })];
    expect(searchEntries(secret, 'needle')).toEqual([]);
  });

  it('filters by tag', () => {
    expect(ids(searchEntries(entries, '', 'work'))).toEqual(['gh', 'steam']);
    expect(ids(searchEntries(entries, 'git', 'work'))).toEqual(['gh']);
  });
});

describe('sortEntries', () => {
  it('sorts by most recently updated', () => {
    expect(ids(sortEntries(entries, 'updated'))).toEqual(['bank', 'gh', 'steam']);
  });

  it('sorts by title', () => {
    expect(ids(sortEntries(entries, 'title'))).toEqual(['gh', 'steam', 'bank']);
  });

  it('does not mutate the input', () => {
    const copy = [...entries];
    sortEntries(entries, 'updated');
    expect(entries).toEqual(copy);
  });
});
```

註：`'title'` 排序使用 `localeCompare(..., 'zh-Hant')`，拉丁字母排在中文字之前。

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/core/query.test.ts`
Expected: FAIL，找不到模組 `../../src/core/query`

- [ ] **Step 3: 實作 `src/core/query.ts`**

```ts
import type { Entry } from './model';

export type SortMode = 'updated' | 'title';

/** 以空白分隔的每個關鍵字都必須出現在標題、網站、帳號或標籤之一（不分大小寫）。 */
export function searchEntries(entries: readonly Entry[], query: string, tag: string | null = null): Entry[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    if (tag !== null && !e.tags.includes(tag)) return false;
    const fields = [e.title, e.url, e.username, ...e.tags].map((f) => f.toLowerCase());
    return terms.every((t) => fields.some((f) => f.includes(t)));
  });
}

export function sortEntries(entries: readonly Entry[], mode: SortMode): Entry[] {
  const byUpdated = (a: Entry, b: Entry) => b.updatedAt.localeCompare(a.updatedAt);
  const copy = [...entries];
  if (mode === 'updated') return copy.sort(byUpdated);
  return copy.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant', { sensitivity: 'base' }) || byUpdated(a, b));
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run tests/core/query.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 5: Commit**

```bash
git add src/core/query.ts tests/core/query.test.ts
git commit -m "feat(core): add entry search and sorting"
```

---

### Task 8: merge（三方合併）

**Files:**
- Create: `src/core/merge.ts`
- Test: `tests/core/merge.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```ts
import { describe, expect, it } from 'vitest';
import { CONFLICT_COPY_SUFFIX, mergeVaults, resolveConflicts } from '../../src/core/merge';
import type { Entry, VaultData } from '../../src/core/model';
import { makeEntry, vaultOf } from '../helpers';

const T1 = '2026-02-01T00:00:00.000Z';
const T2 = '2026-02-02T00:00:00.000Z';
const NOW = new Date('2026-03-01T00:00:00.000Z');

const a = makeEntry({ id: 'a', title: 'A' });
const b = makeEntry({ id: 'b', title: 'B' });
const edit = (e: Entry, changes: Partial<Entry>, updatedAt: string): Entry => ({ ...e, ...changes, updatedAt });
const withTombstone = (data: VaultData, id: string, deletedAt = T1): VaultData => ({
  ...data,
  tombstones: [...data.tombstones, { id, deletedAt }],
});
const ids = (data: VaultData) => data.entries.map((e) => e.id).sort();

describe('mergeVaults', () => {
  const base = vaultOf(a, b);

  it('returns remote when nothing changed locally', () => {
    const remote = vaultOf(edit(a, { title: 'A2' }, T1), b);
    const { data, conflicts } = mergeVaults(base, base, remote);
    expect(conflicts).toEqual([]);
    expect(data.entries.find((e) => e.id === 'a')?.title).toBe('A2');
  });

  it('keeps edits to different entries from both sides', () => {
    const local = vaultOf(edit(a, { title: 'A-local' }, T1), b);
    const remote = vaultOf(a, edit(b, { title: 'B-remote' }, T2));
    const { data, conflicts } = mergeVaults(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(data.entries.find((e) => e.id === 'a')?.title).toBe('A-local');
    expect(data.entries.find((e) => e.id === 'b')?.title).toBe('B-remote');
  });

  it('keeps entries added on both sides', () => {
    const local = vaultOf(a, b, makeEntry({ id: 'new-local' }));
    const remote = vaultOf(a, b, makeEntry({ id: 'new-remote' }));
    expect(ids(mergeVaults(base, local, remote).data)).toEqual(['a', 'b', 'new-local', 'new-remote']);
  });

  it('does not conflict when both sides made the same edit', () => {
    const local = vaultOf(edit(a, { title: 'Same' }, T1), b);
    const remote = vaultOf(edit(a, { title: 'Same' }, T2), b);
    const { data, conflicts } = mergeVaults(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(data.entries.find((e) => e.id === 'a')?.updatedAt).toBe(T2);
  });

  it('reports a conflict when both sides edited the same entry differently', () => {
    const localA = edit(a, { password: 'local' }, T1);
    const remoteA = edit(a, { password: 'remote' }, T2);
    const { data, conflicts } = mergeVaults(base, vaultOf(localA, b), vaultOf(remoteA, b));
    expect(conflicts).toEqual([{ id: 'a', kind: 'edit', local: localA, remote: remoteA }]);
    expect(data.entries.find((e) => e.id === 'a')).toEqual(remoteA);
  });

  it('treats moving to the trash as an ordinary edit', () => {
    const remote = vaultOf(edit(a, { trashedAt: T1 }, T1), b);
    const { data, conflicts } = mergeVaults(base, base, remote);
    expect(conflicts).toEqual([]);
    expect(data.entries.find((e) => e.id === 'a')?.trashedAt).toBe(T1);
  });

  it('applies a remote purge when the local entry is unchanged', () => {
    const remote = withTombstone(vaultOf(b), 'a');
    const { data, conflicts } = mergeVaults(base, base, remote);
    expect(conflicts).toEqual([]);
    expect(ids(data)).toEqual(['b']);
    expect(data.tombstones).toEqual([{ id: 'a', deletedAt: T1 }]);
  });

  it('reports a delete conflict when a purged entry was edited locally', () => {
    const localA = edit(a, { title: 'edited' }, T2);
    const remote = withTombstone(vaultOf(b), 'a');
    const { conflicts } = mergeVaults(base, vaultOf(localA, b), remote);
    expect(conflicts).toEqual([{ id: 'a', kind: 'delete', local: localA, remote: null }]);
  });

  it('does not conflict when both sides purged the same entry', () => {
    const local = withTombstone(vaultOf(b), 'a', T1);
    const remote = withTombstone(vaultOf(b), 'a', T2);
    const { data, conflicts } = mergeVaults(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(data.tombstones).toEqual([{ id: 'a', deletedAt: T2 }]);
  });
});

describe('resolveConflicts', () => {
  const base = vaultOf(a);
  const localA = edit(a, { password: 'local' }, T1);
  const remoteA = edit(a, { password: 'remote' }, T2);
  const editConflict = mergeVaults(base, vaultOf(localA), vaultOf(remoteA));

  it('keeps the local version', () => {
    expect(resolveConflicts(editConflict, { a: 'local' }, NOW).entries).toEqual([localA]);
  });

  it('keeps the remote version', () => {
    expect(resolveConflicts(editConflict, { a: 'remote' }, NOW).entries).toEqual([remoteA]);
  });

  it('keeps both, saving the local version as a copy with a new id', () => {
    const data = resolveConflicts(editConflict, { a: 'both' }, NOW, () => 'copy-id');
    expect(data.entries).toEqual([
      remoteA,
      { ...localA, id: 'copy-id', title: `A${CONFLICT_COPY_SUFFIX}`, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
    ]);
  });

  it('restores an entry and drops its tombstone when the edit is kept over a delete', () => {
    const conflict = mergeVaults(base, vaultOf(localA), withTombstone(vaultOf(), 'a'));
    const data = resolveConflicts(conflict, { a: 'local' }, NOW);
    expect(data.entries).toEqual([localA]);
    expect(data.tombstones).toEqual([]);
  });

  it('accepts the delete', () => {
    const conflict = mergeVaults(base, vaultOf(localA), withTombstone(vaultOf(), 'a'));
    const data = resolveConflicts(conflict, { a: 'remote' }, NOW);
    expect(data.entries).toEqual([]);
    expect(data.tombstones.map((t) => t.id)).toEqual(['a']);
  });

  it('throws when a conflict has no resolution', () => {
    expect(() => resolveConflicts(editConflict, {}, NOW)).toThrow();
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/core/merge.test.ts`
Expected: FAIL，找不到模組 `../../src/core/merge`

- [ ] **Step 3: 實作 `src/core/merge.ts`**

```ts
import type { Entry, Tombstone, VaultData } from './model';

export type ConflictKind = 'edit' | 'delete';

/** local 或 remote 為 null，代表該方已永久刪除。 */
export interface Conflict {
  id: string;
  kind: ConflictKind;
  local: Entry | null;
  remote: Entry | null;
}

/** 有衝突的項目在 data 中暫時採用 remote 版本，需經 resolveConflicts 決定。 */
export interface MergeResult {
  data: VaultData;
  conflicts: Conflict[];
}

export type Resolution = 'local' | 'remote' | 'both';

export const CONFLICT_COPY_SUFFIX = '（本機副本）';

function sameVersion(x: Entry | null, y: Entry | null): boolean {
  if (x === null || y === null) return x === y;
  return x.updatedAt === y.updatedAt;
}

/** 比較 updatedAt 以外的所有欄位。 */
function sameContent(x: Entry, y: Entry): boolean {
  const pick = (e: Entry) =>
    JSON.stringify([
      e.id, e.title, e.url, e.username, e.password, e.notes, e.tags, e.createdAt,
      e.passwordHistory.map((h) => [h.password, h.changedAt]), e.trashedAt,
    ]);
  return pick(x) === pick(y);
}

function byId(entries: readonly Entry[]): Map<string, Entry> {
  return new Map(entries.map((e) => [e.id, e]));
}

function unionTombstones(...lists: Tombstone[][]): Map<string, Tombstone> {
  const map = new Map<string, Tombstone>();
  for (const list of lists) {
    for (const t of list) {
      const current = map.get(t.id);
      if (!current || t.deletedAt > current.deletedAt) map.set(t.id, t);
    }
  }
  return map;
}

/**
 * 以 base（雙方共同的上一版）為基準，逐筆合併 local 與 remote。
 * 「有變」的判斷：與 base 相比，存在與否不同，或 updatedAt 不同。
 */
export function mergeVaults(base: VaultData, local: VaultData, remote: VaultData): MergeResult {
  const B = byId(base.entries);
  const L = byId(local.entries);
  const R = byId(remote.entries);
  const order = [...new Set([...R.keys(), ...L.keys(), ...B.keys()])];

  const entries: Entry[] = [];
  const conflicts: Conflict[] = [];
  for (const id of order) {
    const b = B.get(id) ?? null;
    const l = L.get(id) ?? null;
    const r = R.get(id) ?? null;
    const localChanged = !sameVersion(b, l);
    const remoteChanged = !sameVersion(b, r);

    let result: Entry | null;
    if (!localChanged) result = r;
    else if (!remoteChanged) result = l;
    else if (l === null && r === null) result = null;
    else if (l !== null && r !== null && sameContent(l, r)) result = l.updatedAt > r.updatedAt ? l : r;
    else {
      conflicts.push({ id, kind: l && r ? 'edit' : 'delete', local: l, remote: r });
      result = r;
    }
    if (result) entries.push(result);
  }

  const present = new Set(entries.map((e) => e.id));
  const tombstones = [...unionTombstones(base.tombstones, local.tombstones, remote.tombstones).values()].filter(
    (t) => !present.has(t.id),
  );
  return { data: { schemaVersion: 1, entries, tombstones }, conflicts };
}

export function resolveConflicts(
  result: MergeResult,
  resolutions: Readonly<Record<string, Resolution>>,
  now: Date,
  newId: () => string = () => crypto.randomUUID(),
): VaultData {
  const ts = now.toISOString();
  let entries = result.data.entries;
  const tombstones = new Map(result.data.tombstones.map((t) => [t.id, t]));

  for (const c of result.conflicts) {
    const choice = resolutions[c.id];
    if (!choice) throw new Error(`尚未處理衝突：${c.id}`);

    const keep: Entry[] = [];
    if (choice === 'local') {
      if (c.local) keep.push(c.local);
    } else if (choice === 'remote') {
      if (c.remote) keep.push(c.remote);
    } else {
      if (c.remote) keep.push(c.remote);
      if (c.local) {
        keep.push(
          c.remote
            ? { ...c.local, id: newId(), title: c.local.title + CONFLICT_COPY_SUFFIX, createdAt: ts, updatedAt: ts }
            : c.local,
        );
      }
    }

    entries = [...entries.filter((e) => e.id !== c.id), ...keep];
    if (keep.some((e) => e.id === c.id)) tombstones.delete(c.id);
    else if (!tombstones.has(c.id)) tombstones.set(c.id, { id: c.id, deletedAt: ts });
  }

  return { schemaVersion: 1, entries, tombstones: [...tombstones.values()] };
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run tests/core/merge.test.ts`
Expected: PASS（15 tests）

- [ ] **Step 5: Commit**

```bash
git add src/core/merge.ts tests/core/merge.test.ts
git commit -m "feat(core): add three-way merge with conflict resolution"
```

---

### Task 9: generator（密碼與詞組產生器）

**Files:**
- Create: `src/core/generator.ts`
- Test: `tests/core/generator.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```ts
import { describe, expect, it } from 'vitest';
import {
  AMBIGUOUS,
  DEFAULT_CHAR_OPTIONS,
  DEFAULT_WORD_OPTIONS,
  DIGITS,
  LOWER,
  SYMBOLS,
  UPPER,
  generatePassword,
} from '../../src/core/generator';

const hasAny = (s: string, set: string) => [...s].some((c) => set.includes(c));

describe('character mode', () => {
  it('uses the default length and every character class', () => {
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword(DEFAULT_CHAR_OPTIONS);
      expect(pw).toHaveLength(20);
      expect(hasAny(pw, LOWER) && hasAny(pw, UPPER) && hasAny(pw, DIGITS) && hasAny(pw, SYMBOLS)).toBe(true);
    }
  });

  it('only uses the selected classes', () => {
    const pw = generatePassword({ ...DEFAULT_CHAR_OPTIONS, lower: false, upper: false, symbols: false, length: 32 });
    expect(pw).toMatch(/^[0-9]{32}$/);
  });

  it('excludes ambiguous characters when asked', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword({ ...DEFAULT_CHAR_OPTIONS, excludeAmbiguous: true });
      expect(hasAny(pw, AMBIGUOUS)).toBe(false);
    }
  });

  it('rejects invalid options', () => {
    expect(() => generatePassword({ ...DEFAULT_CHAR_OPTIONS, length: 3 })).toThrow(RangeError);
    expect(() => generatePassword({ ...DEFAULT_CHAR_OPTIONS, length: 129 })).toThrow(RangeError);
    expect(() =>
      generatePassword({ ...DEFAULT_CHAR_OPTIONS, lower: false, upper: false, digits: false, symbols: false }),
    ).toThrow();
  });
});

describe('word mode', () => {
  it('produces capitalized words joined by the separator, plus a digit', () => {
    expect(generatePassword(DEFAULT_WORD_OPTIONS)).toMatch(/^([A-Z][a-z]+-){4}[0-9]$/);
  });

  it('honours capitalize, separator and addNumber', () => {
    const pw = generatePassword({ ...DEFAULT_WORD_OPTIONS, capitalize: false, separator: ' ', addNumber: false, wordCount: 5 });
    expect(pw).toMatch(/^[a-z]+( [a-z]+){4}$/);
  });

  it('rejects an invalid word count', () => {
    expect(() => generatePassword({ ...DEFAULT_WORD_OPTIONS, wordCount: 2 })).toThrow(RangeError);
    expect(() => generatePassword({ ...DEFAULT_WORD_OPTIONS, wordCount: 13 })).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/core/generator.test.ts`
Expected: FAIL，找不到模組 `../../src/core/generator`

- [ ] **Step 3: 實作 `src/core/generator.ts`**

```ts
import { randomInt } from './random';
import { WORDS } from './wordlist';

export const LOWER = 'abcdefghijklmnopqrstuvwxyz';
export const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const DIGITS = '0123456789';
export const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?/~';
export const AMBIGUOUS = '0O1lI';

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 128;
export const MIN_WORDS = 3;
export const MAX_WORDS = 12;

export interface CharOptions {
  mode: 'chars';
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

export interface WordOptions {
  mode: 'words';
  wordCount: number;
  separator: string;
  capitalize: boolean;
  addNumber: boolean;
}

export type GeneratorOptions = CharOptions | WordOptions;

export const DEFAULT_CHAR_OPTIONS: CharOptions = {
  mode: 'chars',
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: false,
};

export const DEFAULT_WORD_OPTIONS: WordOptions = {
  mode: 'words',
  wordCount: 4,
  separator: '-',
  capitalize: true,
  addNumber: true,
};

function pick(chars: string): string {
  return chars[randomInt(chars.length)];
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function generatePassword(options: GeneratorOptions): string {
  return options.mode === 'chars' ? generateChars(options) : generateWords(options);
}

/** 每個勾選的字元類型至少出現一次，其餘從全部可用字元中抽，最後洗牌。 */
function generateChars(o: CharOptions): string {
  if (!Number.isInteger(o.length) || o.length < MIN_LENGTH || o.length > MAX_LENGTH) {
    throw new RangeError(`長度需介於 ${MIN_LENGTH}～${MAX_LENGTH}`);
  }
  const strip = (set: string) => (o.excludeAmbiguous ? [...set].filter((c) => !AMBIGUOUS.includes(c)).join('') : set);
  const sets = [o.lower && LOWER, o.upper && UPPER, o.digits && DIGITS, o.symbols && SYMBOLS]
    .filter((s): s is string => Boolean(s))
    .map(strip);
  if (sets.length === 0) throw new Error('至少要選擇一種字元類型');
  const all = sets.join('');
  const chars = sets.map(pick);
  while (chars.length < o.length) chars.push(pick(all));
  return shuffle(chars).join('');
}

function generateWords(o: WordOptions): string {
  if (!Number.isInteger(o.wordCount) || o.wordCount < MIN_WORDS || o.wordCount > MAX_WORDS) {
    throw new RangeError(`字數需介於 ${MIN_WORDS}～${MAX_WORDS}`);
  }
  const words = Array.from({ length: o.wordCount }, () => {
    const w = WORDS[randomInt(WORDS.length)];
    return o.capitalize ? w[0].toUpperCase() + w.slice(1) : w;
  });
  if (o.addNumber) words.push(String(randomInt(10)));
  return words.join(o.separator);
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run tests/core/generator.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 5: Commit**

```bash
git add src/core/generator.ts tests/core/generator.test.ts
git commit -m "feat(core): add password and passphrase generator"
```

---

### Task 10: strength（主密碼強度估算）

**Files:**
- Create: `src/core/strength.ts`
- Test: `tests/core/strength.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```ts
import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, MIN_STRENGTH_BITS, estimateStrength } from '../../src/core/strength';

describe('estimateStrength', () => {
  it.each([
    'Tr0ub4dor&3x',
    'correct-horse-battery',
    '月亮-檯燈-咖啡-跑步-藍色',
    'Orbit-Velvet-Canyon-Mosaic-7',
  ])('accepts %s', (pw) => {
    const r = estimateStrength(pw);
    expect(r.acceptable).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.bits).toBeGreaterThanOrEqual(MIN_STRENGTH_BITS);
  });

  it.each(['aaaaaaaaaaaa', 'abcdefghijkl', 'password1234', 'qwertyuiopas', '123456123456', '一一一一一一一一一一一一'])(
    'rejects patterned password %s',
    (pw) => {
      const r = estimateStrength(pw);
      expect(r.acceptable).toBe(false);
      expect(r.bits).toBeLessThan(MIN_STRENGTH_BITS);
      expect(r.reason).toMatch(/容易被猜到/);
    },
  );

  it('rejects short passwords with a length message', () => {
    const r = estimateStrength('Sh0rt!x');
    expect(r.acceptable).toBe(false);
    expect(r.reason).toBe(`至少需要 ${MIN_PASSWORD_LENGTH} 個字元`);
  });

  it('rejects an empty password', () => {
    expect(estimateStrength('')).toEqual({ bits: 0, level: 0, acceptable: false, reason: '請輸入主密碼' });
  });

  it('assigns higher levels to stronger passwords', () => {
    expect(estimateStrength('password1234').level).toBe(0);
    expect(estimateStrength('Orbit-Velvet-Canyon-Mosaic-7').level).toBe(4);
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/core/strength.test.ts`
Expected: FAIL，找不到模組 `../../src/core/strength`

- [ ] **Step 3: 實作 `src/core/strength.ts`**

```ts
export const MIN_PASSWORD_LENGTH = 12;
export const MIN_STRENGTH_BITS = 60;

export interface StrengthResult {
  bits: number;
  level: 0 | 1 | 2 | 3 | 4;
  acceptable: boolean;
  reason: string | null;
}

const KEYBOARD_ROWS = ['`1234567890-=', 'qwertyuiop[]\\', "asdfghjkl;'", 'zxcvbnm,./'];
const COMMON_WORDS = [
  'password', 'passw0rd', 'qwerty', '123456', 'admin', 'letmein', 'welcome',
  'iloveyou', 'abc123', 'monkey', 'dragon', '111111', 'sunshine', 'princess', 'football',
];
/** 重複、連續或鍵盤相鄰的字元只算 0.2 個字元的熵。 */
const PATTERN_WEIGHT = 0.2;
const COMMON_WORD_PENALTY = 0.8;

function charPool(chars: string[]): number {
  let pool = 0;
  if (chars.some((c) => /[a-z]/.test(c))) pool += 26;
  if (chars.some((c) => /[A-Z]/.test(c))) pool += 26;
  if (chars.some((c) => /[0-9]/.test(c))) pool += 10;
  if (chars.some((c) => /[ !-/:-@[-`{-~]/.test(c))) pool += 33;
  if (chars.some((c) => c.codePointAt(0)! > 0x7e)) pool += 2000;
  return pool;
}

function keyboardAdjacent(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return KEYBOARD_ROWS.some((row) => {
    const i = row.indexOf(x);
    const j = row.indexOf(y);
    return i >= 0 && j >= 0 && Math.abs(i - j) === 1;
  });
}

function isPatterned(prev: string, cur: string): boolean {
  if (prev === cur) return true;
  if (Math.abs(cur.codePointAt(0)! - prev.codePointAt(0)!) === 1) return true;
  return keyboardAdjacent(prev, cur);
}

function levelOf(bits: number): StrengthResult['level'] {
  if (bits < 40) return 0;
  if (bits < 60) return 1;
  if (bits < 80) return 2;
  if (bits < 100) return 3;
  return 4;
}

export function estimateStrength(password: string): StrengthResult {
  const chars = [...password];
  if (chars.length === 0) return { bits: 0, level: 0, acceptable: false, reason: '請輸入主密碼' };

  let effective = 0;
  chars.forEach((c, i) => {
    effective += i > 0 && isPatterned(chars[i - 1], c) ? PATTERN_WEIGHT : 1;
  });
  const lower = password.toLowerCase();
  for (const word of COMMON_WORDS) {
    if (lower.includes(word)) effective -= word.length * COMMON_WORD_PENALTY;
  }
  effective = Math.max(effective, 0);

  const bits = Math.round(effective * Math.log2(charPool(chars)));
  let reason: string | null = null;
  if (chars.length < MIN_PASSWORD_LENGTH) reason = `至少需要 ${MIN_PASSWORD_LENGTH} 個字元`;
  else if (bits < MIN_STRENGTH_BITS) reason = '密碼太容易被猜到，請加長或混用不同類型的字元';
  return { bits, level: levelOf(bits), acceptable: reason === null, reason };
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run tests/core/strength.test.ts`
Expected: PASS（13 tests）

- [ ] **Step 5: Commit**

```bash
git add src/core/strength.ts tests/core/strength.test.ts
git commit -m "feat(core): add master password strength estimator"
```

---

### Task 11: csv（明文匯出）

**Files:**
- Create: `src/core/csv.ts`
- Test: `tests/core/csv.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```ts
import { describe, expect, it } from 'vitest';
import { exportCsv } from '../../src/core/csv';
import { makeEntry, vaultOf } from '../helpers';

describe('exportCsv', () => {
  it('writes a BOM, a Chinese header row and CRLF line endings', () => {
    const csv = exportCsv(vaultOf());
    expect(csv).toBe('﻿標題,網站,帳號,密碼,備註,標籤,更新日期\r\n');
  });

  it('quotes fields containing commas, quotes, newlines or edge spaces', () => {
    const csv = exportCsv(
      vaultOf(
        makeEntry({
          title: 'A, B',
          password: 'he said "hi"',
          notes: 'line1\nline2',
          username: ' padded ',
          tags: ['work', 'dev'],
          updatedAt: '2026-01-02T03:04:05.000Z',
        }),
      ),
    );
    const row = csv.split('\r\n')[1];
    expect(row).toBe(
      '"A, B",https://github.com," padded ","he said ""hi""","line1\nline2",work;dev,2026-01-02T03:04:05.000Z',
    );
  });

  it('skips entries in the trash', () => {
    const csv = exportCsv(vaultOf(makeEntry({ id: 'x', title: 'Gone', trashedAt: '2026-01-01T00:00:00.000Z' })));
    expect(csv).not.toContain('Gone');
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/core/csv.test.ts`
Expected: FAIL，找不到模組 `../../src/core/csv`

- [ ] **Step 3: 實作 `src/core/csv.ts`**

```ts
import { activeEntries, type VaultData } from './model';

export const CSV_HEADERS = ['標題', '網站', '帳號', '密碼', '備註', '標籤', '更新日期'];

function cell(value: string): string {
  return /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 匯出垃圾桶以外的項目。開頭加 BOM，讓 Excel 正確辨識 UTF-8。 */
export function exportCsv(data: VaultData): string {
  const rows = activeEntries(data).map((e) => [
    e.title, e.url, e.username, e.password, e.notes, e.tags.join(';'), e.updatedAt,
  ]);
  return '﻿' + [CSV_HEADERS, ...rows].map((r) => r.map(cell).join(',') + '\r\n').join('');
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run tests/core/csv.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add src/core/csv.ts tests/core/csv.test.ts
git commit -m "feat(core): add plaintext CSV export"
```

---

### Task 12: 全面驗證

- [ ] **Step 1: 執行所有測試**

Run: `npm test`
Expected: 全部通過（約 96 tests），0 failed

- [ ] **Step 2: 型別檢查**

Run: `npm run check`
Expected: `svelte-check found 0 errors and 0 warnings`

- [ ] **Step 3: 建置**

Run: `npm run build`
Expected: 建置成功

- [ ] **Step 4: 若有修正，Commit**

```bash
git add -A
git commit -m "chore: fix type errors found in final verification"
```

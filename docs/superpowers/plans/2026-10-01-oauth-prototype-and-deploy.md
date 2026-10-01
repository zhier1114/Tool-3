# 密碼管理工具：OAuth 原型與自動部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 App 自動部署到 `https://zhier1114.github.io/Tool-3/`，並做出最小的 Google 登入原型（整頁跳轉的 implicit flow 加上一次 Drive API 呼叫），用來驗證規格第 5 節的風險：iPhone「加入主畫面」模式下能不能正常登入。

**Architecture:** OAuth 邏輯集中在 `src/storage/auth.ts`。所有瀏覽器相依（sessionStorage、location、history、亂數）都透過 `AuthEnv` 注入，所以可以用假物件做單元測試。Drive 呼叫透過可注入的 `fetch`。CSP 只在 build 時以 Vite plugin 寫進 `index.html`，因為 dev server 需要 inline style。

**Tech Stack:** 沿用核心函式庫；另外加上 GitHub Actions（各 action 鎖定 commit SHA）、PWA manifest，以及用 PowerShell System.Drawing 產生的圖示。

**前置條件：** 已完成 `docs/setup/google-cloud-and-github-pages.md`。用戶端 ID 為 `1028578692002-6uhji7g1sb1p2ki0pi5bpvrjt3fl0a63.apps.googleusercontent.com`。

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `vite.config.ts`（修改） | build 時的 base 改為 `/Tool-3/`，加入 CSP plugin |
| `index.html`（修改） | PWA 與 iOS 主畫面相關的 meta、manifest、圖示 |
| `public/manifest.webmanifest` | PWA manifest |
| `scripts/build-icons.ps1` | 產生 `public/icons/*.png` |
| `src/app.css` | 全域樣式（含深色模式） |
| `src/main.ts`（修改） | 防止被嵌入 iframe、載入全域樣式 |
| `src/config.ts` | 用戶端 ID、權限範圍、重新導向網址 |
| `src/storage/auth.ts` | 組 OAuth 網址、解析回應、`AuthSession` 管理 state 與權杖 |
| `src/storage/drive.ts` | `findVaultFiles`（原型用的 Drive 查詢，下一份計畫擴充成完整的 client） |
| `src/App.svelte`（修改） | 登入原型畫面，含診斷資訊 |
| `.github/workflows/deploy.yml` | 測試、型別檢查、建置、部署到 Pages |
| `tests/storage/auth.test.ts`、`tests/storage/drive.test.ts` | 單元測試 |

---

### Task 1: PWA 外殼、CSP、圖示

**Files:**
- Modify: `vite.config.ts`, `index.html`, `src/main.ts`
- Create: `public/manifest.webmanifest`, `scripts/build-icons.ps1`, `public/icons/*.png`（由腳本產生）, `src/app.css`

- [ ] **Step 1: 改寫 `vite.config.ts`**

```ts
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data:",
  'connect-src https://www.googleapis.com https://oauth2.googleapis.com',
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

/** GitHub Pages 無法設定 HTTP header，改以 meta 寫入 CSP。dev server 需要 inline style，所以只在 build 時套用。 */
function cspPlugin(): Plugin {
  return {
    name: 'pwvault-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      ),
  };
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Tool-3/' : '/',
  plugins: [svelte(), cspPlugin()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
```

- [ ] **Step 2: 改寫 `index.html`**

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="referrer" content="no-referrer" />
    <meta name="theme-color" content="#0f1b2d" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="密碼庫" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <link rel="icon" type="image/png" href="/icons/icon-192.png" />
    <title>密碼管理工具</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: 建立 `public/manifest.webmanifest`**

```json
{
  "name": "密碼管理工具",
  "short_name": "密碼庫",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#0f1b2d",
  "theme_color": "#0f1b2d",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 4: 建立 `scripts/build-icons.ps1` 並執行**

```powershell
# 產生 App 圖示（深藍底、白色鎖頭）。用法：powershell -File scripts/build-icons.ps1
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\public\icons'
New-Item -ItemType Directory -Force $out | Out-Null
$navy = [System.Drawing.Color]::FromArgb(15, 27, 45)

function New-Icon([int]$size, [string]$name) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear($navy)
  $s = $size / 512.0
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $bg = New-Object System.Drawing.SolidBrush $navy
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([single](40 * $s))
  # 鎖環
  $g.DrawArc($pen, [single](176 * $s), [single](120 * $s), [single](160 * $s), [single](170 * $s), 180, 180)
  $g.DrawLine($pen, [single](176 * $s), [single](195 * $s), [single](176 * $s), [single](250 * $s))
  $g.DrawLine($pen, [single](336 * $s), [single](195 * $s), [single](336 * $s), [single](250 * $s))
  # 鎖身與鑰匙孔
  $g.FillRectangle($white, [single](136 * $s), [single](240 * $s), [single](240 * $s), [single](180 * $s))
  $g.FillEllipse($bg, [single](232 * $s), [single](290 * $s), [single](48 * $s), [single](48 * $s))
  $g.FillRectangle($bg, [single](246 * $s), [single](320 * $s), [single](20 * $s), [single](60 * $s))
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

New-Icon 192 'icon-192.png'
New-Icon 512 'icon-512.png'
New-Icon 180 'apple-touch-icon.png'
Write-Output "Icons written to $out"
```

Run: `powershell -ExecutionPolicy Bypass -File scripts/build-icons.ps1`
Expected: `public/icons/` 下有 `icon-192.png`、`icon-512.png`、`apple-touch-icon.png`

- [ ] **Step 5: 建立 `src/app.css`，並改寫 `src/main.ts`**

`src/app.css`:
```css
:root {
  color-scheme: light dark;
  --bg: #f5f6f8;
  --fg: #1a1d23;
  --muted: #5b6270;
  --card: #ffffff;
  --border: #d9dde3;
  --accent: #1f5fbf;
  --accent-fg: #ffffff;
  font-family: system-ui, -apple-system, 'Segoe UI', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif;
  font-size: 16px;
  line-height: 1.5;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1b2d;
    --fg: #e8ebf0;
    --muted: #9aa3b2;
    --card: #17263d;
    --border: #2a3b55;
    --accent: #5b9bff;
    --accent-fg: #0f1b2d;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
}

button {
  font: inherit;
  padding: 0.6rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--fg);
  cursor: pointer;
}

button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
}
```

`src/main.ts`:
```ts
import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

// meta CSP 無法設定 frame-ancestors，改由程式拒絕在 iframe 中執行，防止點擊劫持。
if (window.top !== window.self) {
  document.body.textContent = '基於安全考量，本工具不能在其他網頁中開啟。';
  throw new Error('拒絕在 iframe 中執行');
}

mount(App, { target: document.getElementById('app')! });
```

- [ ] **Step 6: 建置並檢查輸出**

Run: `npm run build`，接著 `cat dist/index.html`
Expected: `<meta charset>` 之後是 CSP meta；manifest、圖示、script 的路徑都以 `/Tool-3/` 開頭；`dist/icons/` 和 `dist/manifest.webmanifest` 存在。

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts index.html public scripts/build-icons.ps1 src/app.css src/main.ts
git commit -m "feat: add PWA shell, CSP and app icons"
```

---

### Task 2: config 與 auth

**Files:**
- Create: `src/config.ts`, `src/storage/auth.ts`
- Test: `tests/storage/auth.test.ts`

- [ ] **Step 1: 建立 `src/config.ts`**

```ts
/** OAuth 用戶端 ID 不是秘密。安全性來自 Google Cloud 上設定的授權來源與測試使用者名單。 */
export const GOOGLE_CLIENT_ID = '1028578692002-6uhji7g1sb1p2ki0pi5bpvrjt3fl0a63.apps.googleusercontent.com';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** App 根目錄網址，必須與 Google Cloud 上的「已授權的重新導向 URI」完全一致。 */
export function redirectUri(): string {
  return new URL(import.meta.env.BASE_URL, location.origin).href;
}
```

- [ ] **Step 2: 寫失敗的測試 `tests/storage/auth.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  AuthSession,
  EXPIRY_MARGIN_MS,
  buildAuthUrl,
  parseAuthCallback,
  type AuthEnv,
  type KeyValueStore,
} from '../../src/storage/auth';

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

class FakeEnv implements AuthEnv {
  store = new MemoryStore();
  time = 1_000_000;
  hash = '';
  navigated: string[] = [];
  clientId = 'client-id';
  redirectUri = 'https://example.com/app/';
  scope = 'scope-x';
  now = () => this.time;
  navigate = (url: string) => {
    this.navigated.push(url);
  };
  readHash = () => this.hash;
  clearHash = () => {
    this.hash = '';
  };
  randomState = () => 'state-123';
}

const TOKEN_HASH = '#access_token=tok&token_type=Bearer&expires_in=3600&state=state-123&scope=scope-x';

describe('buildAuthUrl', () => {
  it('builds an implicit-flow URL for Google', () => {
    const url = new URL(
      buildAuthUrl({ clientId: 'cid', redirectUri: 'https://e.com/', scope: 's', state: 'st', prompt: 'none' }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'cid',
      redirect_uri: 'https://e.com/',
      response_type: 'token',
      scope: 's',
      state: 'st',
      include_granted_scopes: 'true',
      prompt: 'none',
    });
  });

  it('omits prompt when not given', () => {
    const url = new URL(buildAuthUrl({ clientId: 'cid', redirectUri: 'https://e.com/', scope: 's', state: 'st' }));
    expect(url.searchParams.has('prompt')).toBe(false);
  });
});

describe('parseAuthCallback', () => {
  it('parses a token response', () => {
    expect(parseAuthCallback(TOKEN_HASH, 5000)).toEqual({
      kind: 'token',
      state: 'state-123',
      token: { value: 'tok', expiresAt: 5000 + 3600 * 1000 },
    });
  });

  it('parses an error response', () => {
    expect(parseAuthCallback('#error=access_denied&state=s', 0)).toEqual({ kind: 'error', state: 's', error: 'access_denied' });
  });

  it('returns null when the hash is not an OAuth response', () => {
    expect(parseAuthCallback('', 0)).toBeNull();
    expect(parseAuthCallback('#section', 0)).toBeNull();
  });

  it('rejects an invalid expires_in', () => {
    expect(parseAuthCallback('#access_token=t&expires_in=abc&state=s', 0)).toEqual({
      kind: 'error',
      state: 's',
      error: 'invalid_expires_in',
    });
  });
});

describe('AuthSession', () => {
  it('begin stores a state and navigates to Google', () => {
    const env = new FakeEnv();
    new AuthSession(env).begin('select_account');
    const url = new URL(env.navigated[0]);
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('prompt')).toBe('select_account');
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/app/');
  });

  it('complete returns none when there is no OAuth response', () => {
    expect(new AuthSession(new FakeEnv()).complete()).toEqual({ status: 'none' });
  });

  it('complete stores the token when the state matches', () => {
    const env = new FakeEnv();
    const auth = new AuthSession(env);
    auth.begin();
    env.hash = TOKEN_HASH;
    const token = { value: 'tok', expiresAt: env.time + 3600 * 1000 };
    expect(auth.complete()).toEqual({ status: 'ok', token });
    expect(env.hash).toBe('');
    expect(auth.current()).toEqual(token);
    expect(env.store.map.has('pwvault.oauth.state')).toBe(false);
  });

  it('complete rejects a mismatched state', () => {
    const env = new FakeEnv();
    const auth = new AuthSession(env);
    auth.begin();
    env.hash = TOKEN_HASH.replace('state-123', 'evil');
    expect(auth.complete()).toEqual({ status: 'error', error: 'state_mismatch' });
    expect(auth.current()).toBeNull();
  });

  it('complete rejects a response when no login was started', () => {
    const env = new FakeEnv();
    env.hash = TOKEN_HASH;
    expect(new AuthSession(env).complete()).toEqual({ status: 'error', error: 'state_mismatch' });
  });

  it('complete reports an OAuth error', () => {
    const env = new FakeEnv();
    const auth = new AuthSession(env);
    auth.begin();
    env.hash = '#error=access_denied&state=state-123';
    expect(auth.complete()).toEqual({ status: 'error', error: 'access_denied' });
  });

  it('current treats a token as expired within the safety margin', () => {
    const env = new FakeEnv();
    const auth = new AuthSession(env);
    auth.begin();
    env.hash = TOKEN_HASH;
    auth.complete();
    env.time += 3600 * 1000 - EXPIRY_MARGIN_MS - 1;
    expect(auth.current()).not.toBeNull();
    env.time += 1;
    expect(auth.current()).toBeNull();
  });

  it('current ignores corrupt stored data', () => {
    const env = new FakeEnv();
    env.store.setItem('pwvault.oauth.token', '{oops');
    expect(new AuthSession(env).current()).toBeNull();
  });

  it('logout forgets the token', () => {
    const env = new FakeEnv();
    const auth = new AuthSession(env);
    auth.begin();
    env.hash = TOKEN_HASH;
    auth.complete();
    auth.logout();
    expect(auth.current()).toBeNull();
  });
});
```

- [ ] **Step 3: 執行測試，確認失敗**

Run: `npx vitest run tests/storage/auth.test.ts`
Expected: FAIL，找不到模組 `../../src/storage/auth`

- [ ] **Step 4: 實作 `src/storage/auth.ts`**

```ts
import { randomBytes } from '../core/random';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const STATE_KEY = 'pwvault.oauth.state';
const TOKEN_KEY = 'pwvault.oauth.token';
/** 權杖到期前 1 分鐘就視為過期，避免請求途中失效。 */
export const EXPIRY_MARGIN_MS = 60_000;

export interface AccessToken {
  value: string;
  /** epoch 毫秒 */
  expiresAt: number;
}

export type Prompt = 'none' | 'consent' | 'select_account';

export interface AuthUrlOptions {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  prompt?: Prompt;
}

export function buildAuthUrl(o: AuthUrlOptions): string {
  const params = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: 'token',
    scope: o.scope,
    state: o.state,
    include_granted_scopes: 'true',
  });
  if (o.prompt) params.set('prompt', o.prompt);
  return `${AUTH_ENDPOINT}?${params}`;
}

export type AuthCallback =
  | { kind: 'token'; state: string; token: AccessToken }
  | { kind: 'error'; state: string; error: string };

/** 解析 Google 導回時附在網址 # 之後的參數；不是 OAuth 回應就回傳 null。 */
export function parseAuthCallback(hash: string, now: number): AuthCallback | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const state = params.get('state') ?? '';
  const error = params.get('error');
  if (error) return { kind: 'error', state, error };
  const value = params.get('access_token');
  if (!value) return null;
  const expiresIn = Number(params.get('expires_in'));
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return { kind: 'error', state, error: 'invalid_expires_in' };
  return { kind: 'token', state, token: { value, expiresAt: now + expiresIn * 1000 } };
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AuthEnv {
  store: KeyValueStore;
  now(): number;
  navigate(url: string): void;
  readHash(): string;
  clearHash(): void;
  randomState(): string;
  clientId: string;
  redirectUri: string;
  scope: string;
}

export type CompleteResult =
  | { status: 'none' }
  | { status: 'ok'; token: AccessToken }
  | { status: 'error'; error: string };

export class AuthSession {
  constructor(private readonly env: AuthEnv) {}

  /** 產生一次性的 state（防 CSRF）後，整頁導向 Google 登入。 */
  begin(prompt?: Prompt): void {
    const state = this.env.randomState();
    this.env.store.setItem(STATE_KEY, state);
    this.env.navigate(
      buildAuthUrl({
        clientId: this.env.clientId,
        redirectUri: this.env.redirectUri,
        scope: this.env.scope,
        state,
        prompt,
      }),
    );
  }

  /** 頁面載入時呼叫：處理 Google 導回的結果，並把權杖從網址上清掉。 */
  complete(): CompleteResult {
    const callback = parseAuthCallback(this.env.readHash(), this.env.now());
    if (!callback) return { status: 'none' };
    this.env.clearHash();
    const expected = this.env.store.getItem(STATE_KEY);
    this.env.store.removeItem(STATE_KEY);
    if (!expected || callback.state !== expected) return { status: 'error', error: 'state_mismatch' };
    if (callback.kind === 'error') return { status: 'error', error: callback.error };
    this.env.store.setItem(TOKEN_KEY, JSON.stringify(callback.token));
    return { status: 'ok', token: callback.token };
  }

  current(): AccessToken | null {
    const raw = this.env.store.getItem(TOKEN_KEY);
    if (!raw) return null;
    try {
      const token = JSON.parse(raw) as AccessToken;
      if (typeof token.value !== 'string' || typeof token.expiresAt !== 'number') return null;
      return token.expiresAt - EXPIRY_MARGIN_MS > this.env.now() ? token : null;
    } catch {
      return null;
    }
  }

  logout(): void {
    this.env.store.removeItem(TOKEN_KEY);
    this.env.store.removeItem(STATE_KEY);
  }
}

export function browserAuthEnv(config: Pick<AuthEnv, 'clientId' | 'redirectUri' | 'scope'>): AuthEnv {
  return {
    ...config,
    store: sessionStorage,
    now: () => Date.now(),
    navigate: (url) => location.assign(url),
    readHash: () => location.hash,
    clearHash: () => history.replaceState(null, '', location.pathname + location.search),
    randomState: () => Array.from(randomBytes(16), (b) => b.toString(16).padStart(2, '0')).join(''),
  };
}
```

- [ ] **Step 5: 執行測試，確認通過**

Run: `npx vitest run tests/storage/auth.test.ts`
Expected: PASS（15 tests）

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/storage/auth.ts tests/storage/auth.test.ts
git commit -m "feat(storage): add Google OAuth implicit-flow session"
```

---

### Task 3: drive（原型用的查詢）

**Files:**
- Create: `src/storage/drive.ts`
- Test: `tests/storage/drive.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```ts
import { describe, expect, it } from 'vitest';
import { DriveError, findVaultFiles } from '../../src/storage/drive';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fn, calls };
}

describe('findVaultFiles', () => {
  it('queries the app-tagged vault files with a bearer token', async () => {
    const file = { id: 'f1', name: 'vault.enc', version: '3', modifiedTime: '2026-10-01T00:00:00.000Z' };
    const { fn, calls } = fakeFetch(200, { files: [file] });
    expect(await findVaultFiles('tok', fn)).toEqual([file]);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/drive/v3/files');
    expect(url.searchParams.get('q')).toBe("appProperties has { key='pwvault' and value='1' } and trashed=false");
    expect(url.searchParams.get('fields')).toBe('files(id,name,version,modifiedTime)');
    expect(new Headers(calls[0].init?.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('returns an empty list when Drive omits files', async () => {
    expect(await findVaultFiles('tok', fakeFetch(200, {}).fn)).toEqual([]);
  });

  it('throws a DriveError carrying the HTTP status', async () => {
    const error = await findVaultFiles('tok', fakeFetch(401, { error: 'x' }).fn).catch((e) => e);
    expect(error).toBeInstanceOf(DriveError);
    expect(error.status).toBe(401);
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/storage/drive.test.ts`
Expected: FAIL，找不到模組 `../../src/storage/drive`

- [ ] **Step 3: 實作 `src/storage/drive.ts`**

```ts
const API = 'https://www.googleapis.com/drive/v3';
const VAULT_QUERY = "appProperties has { key='pwvault' and value='1' } and trashed=false";

export class DriveError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`Google Drive 錯誤 ${status}：${detail}`);
    this.name = 'DriveError';
  }
}

export interface DriveFileInfo {
  id: string;
  name: string;
  version: string;
  modifiedTime: string;
}

export async function findVaultFiles(token: string, fetchFn: typeof fetch = fetch): Promise<DriveFileInfo[]> {
  const params = new URLSearchParams({ q: VAULT_QUERY, spaces: 'drive', fields: 'files(id,name,version,modifiedTime)' });
  const res = await fetchFn(`${API}/files?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new DriveError(res.status, await res.text());
  const body = (await res.json()) as { files?: DriveFileInfo[] };
  return body.files ?? [];
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run tests/storage/drive.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add src/storage/drive.ts tests/storage/drive.test.ts
git commit -m "feat(storage): add Drive vault file lookup"
```

---

### Task 4: 登入原型畫面

**Files:**
- Modify: `src/App.svelte`

- [ ] **Step 1: 改寫 `src/App.svelte`**

```svelte
<script lang="ts">
  import { DRIVE_SCOPE, GOOGLE_CLIENT_ID, redirectUri } from './config';
  import { AuthSession, browserAuthEnv, type CompleteResult } from './storage/auth';
  import { findVaultFiles } from './storage/drive';

  const auth = new AuthSession(
    browserAuthEnv({ clientId: GOOGLE_CLIENT_ID, redirectUri: redirectUri(), scope: DRIVE_SCOPE }),
  );
  const callback: CompleteResult = auth.complete();
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  let token = $state(auth.current());
  let driveResult = $state('');

  function describeCallback(result: CompleteResult): string {
    if (result.status === 'none') return '無';
    if (result.status === 'ok') return '成功取得權杖';
    return `錯誤：${result.error}`;
  }

  async function testDrive() {
    if (!token) return;
    driveResult = '查詢中…';
    try {
      const files = await findVaultFiles(token.value);
      driveResult = `成功：找到 ${files.length} 個保險庫檔案`;
    } catch (e) {
      driveResult = `失敗：${(e as Error).message}`;
    }
  }

  function logout() {
    auth.logout();
    token = null;
    driveResult = '';
  }
</script>

<main>
  <h1>密碼管理工具</h1>
  <p class="muted">登入流程原型（第 0 步）</p>

  <dl>
    <dt>執行模式</dt>
    <dd>{standalone ? '主畫面 App（standalone）' : '瀏覽器分頁'}</dd>
    <dt>這次載入的登入回應</dt>
    <dd>{describeCallback(callback)}</dd>
    <dt>登入狀態</dt>
    <dd>
      {token ? `已登入，權杖於 ${new Date(token.expiresAt).toLocaleTimeString('zh-TW')} 到期` : '未登入'}
    </dd>
  </dl>

  <div class="actions">
    {#if token}
      <button class="primary" onclick={testDrive}>測試讀取 Google Drive</button>
      <button onclick={logout}>登出</button>
    {:else}
      <button class="primary" onclick={() => auth.begin('select_account')}>登入 Google</button>
      <button onclick={() => auth.begin('none')}>無聲重新登入</button>
    {/if}
  </div>

  {#if driveResult}
    <p class="result">{driveResult}</p>
  {/if}
</main>

<style>
  main {
    max-width: 32rem;
    margin: 0 auto;
    padding: 1.5rem 1rem;
  }
  h1 {
    margin: 0 0 0.25rem;
  }
  .muted {
    color: var(--muted);
    margin-top: 0;
  }
  dl {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
  }
  dt {
    color: var(--muted);
    font-size: 0.85rem;
  }
  dd {
    margin: 0 0 0.75rem;
  }
  dd:last-child {
    margin-bottom: 0;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .result {
    margin-top: 1rem;
  }
</style>
```

- [ ] **Step 2: 本機驗證**

Run: `npm run check`、`npm test`、`npm run build`
Expected: 全部通過。再執行 `npm run dev`，用瀏覽器開 `http://localhost:5173/`：按「登入 Google」→ 完成登入 → 回到頁面時應顯示「成功取得權杖」→ 按「測試讀取 Google Drive」應顯示「成功：找到 0 個保險庫檔案」。

- [ ] **Step 3: Commit**

```bash
git add src/App.svelte
git commit -m "feat: add OAuth login prototype screen"
```

---

### Task 5: GitHub Actions 部署

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: 建立 workflow**

各 action 都鎖定 commit SHA，避免 tag 被改寫造成供應鏈攻擊。

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run check
      - run: npm run build
      - uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1
```

- [ ] **Step 2: Commit 並推送**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: build, test and deploy to GitHub Pages"
git push
```

- [ ] **Step 3: 確認部署**

Run: `curl -s https://zhier1114.github.io/Tool-3/ | grep -c Content-Security-Policy`
Expected: 約 1～2 分鐘後輸出 `1`。若一直是 404，請到 `https://github.com/zhier1114/Tool-3/actions` 查看 workflow 紀錄。

---

### Task 6: iPhone 實測（使用者操作）

在 Windows Edge 與 iPhone 上各測一次，記錄每一步畫面上「這次載入的登入回應」與「登入狀態」：

1. **Windows Edge**：開 `https://zhier1114.github.io/Tool-3/` → 登入 Google → 測試讀取 Drive。
2. **iPhone Safari 分頁**：同上。
3. **iPhone 主畫面 App**：Safari 分享 →「加入主畫面」→ 從主畫面圖示開啟。確認「執行模式」顯示 standalone → 登入 Google → 觀察：
   - 登入完成後，是回到主畫面 App，還是停留在 Safari？
   - 回應是「成功取得權杖」，還是「錯誤：state_mismatch」？
   - 測試讀取 Drive 是否成功？
4. **iPhone 主畫面 App 無聲重新登入**：登出 → 按「無聲重新登入」→ 是否不用再選帳號就直接成功？

結果決定下一份計畫的方向：
- **全部成功**：沿用整頁跳轉的設計。
- **主畫面模式失敗**：改用 Google Identity Services 的彈出視窗流程，CSP 增加 `accounts.google.com`，並重測。

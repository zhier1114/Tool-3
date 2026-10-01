# 密碼管理工具：Google Drive 讀寫與同步服務 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 Google Drive 的檔案讀寫 client，以及同步服務（建立、尋找、解鎖保險庫；存檔前檢查版本、三方合併、衝突交給 UI 決定；修改主密碼與救援碼；鎖定）。實作規格第 5、6 節。

**Architecture:** `DriveClient` 介面有兩個實作：`GoogleDriveClient`（REST，可注入 fetch 與取權杖函式）與 `FakeDrive`（記憶體）。同步服務 `syncService.ts` 只依賴 `DriveClient` 介面，所以能讓兩個 `UnlockedVault` 實例共用同一個 `FakeDrive`，模擬兩台裝置同時操作。衝突解決以 `ConflictResolver` 回呼交給 UI。

**Tech Stack:** 沿用前兩份計畫。

**同步演算法（`UnlockedVault.sync`）：** 最多重試 3 次：
1. 查詢雲端 `version`。
2. 與 `baseVersion` 不同時：下載雲端版本，`mergeVaults(base, current, remote)`；有衝突就呼叫 resolver；接著把 `base` 換成雲端版本、`baseVersion` 換成雲端版本號，回到第 1 步重新確認（處理使用者在解決衝突時雲端又被改動的情況）。
3. 相同時：對 `current` 執行 `cleanup`。若 `current` 與 `base` 內容相同就結束；不同就加密上傳，並把 `base` 更新為 `current`。

上傳失敗時，`current` 保留本機修改、`base` 不變，所以下次同步會一併送出。

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `src/storage/driveClient.ts` | `DriveClient` 介面、`GoogleDriveClient`、`DriveError`、`AuthExpiredError` |
| `src/storage/fakeDrive.ts` | 測試用的記憶體版 Drive |
| `src/storage/syncService.ts` | `locateVault`、`createVault`、`unlockVault`、`UnlockedVault` |
| `src/storage/drive.ts`、`tests/storage/drive.test.ts`（刪除） | 由 `driveClient.ts` 取代 |
| `src/App.svelte`（修改） | 原型改用 `GoogleDriveClient.findVault` |
| `tests/storage/driveClient.test.ts`、`tests/storage/syncService.test.ts` | 單元測試 |

---

### Task 1: GoogleDriveClient

**Files:**
- Create: `src/storage/driveClient.ts`
- Test: `tests/storage/driveClient.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```ts
import { describe, expect, it } from 'vitest';
import { AuthExpiredError, DriveError, GoogleDriveClient } from '../../src/storage/driveClient';

interface Req {
  url: URL;
  method: string;
  headers: Headers;
  body: string;
}

function fakeFetch(route: (req: Req) => Response) {
  const requests: Req[] = [];
  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const req: Req = {
      url: new URL(String(input)),
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? init.body : '',
    };
    requests.push(req);
    return route(req);
  }) as typeof fetch;
  return { fn, requests };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const client = (fn: typeof fetch, token: string | null = 'tok') => new GoogleDriveClient(() => token, fn);

describe('GoogleDriveClient.findVault', () => {
  it('returns the most recently modified vault file', async () => {
    const { fn, requests } = fakeFetch(() => json({ files: [{ id: 'f1', version: '7' }, { id: 'f0', version: '2' }] }));
    expect(await client(fn).findVault()).toEqual({ id: 'f1', version: '7' });
    const { url, headers } = requests[0];
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/drive/v3/files');
    expect(url.searchParams.get('q')).toBe("appProperties has { key='pwvault' and value='1' } and trashed=false");
    expect(url.searchParams.get('orderBy')).toBe('modifiedTime desc');
    expect(url.searchParams.get('fields')).toBe('files(id,version)');
    expect(headers.get('Authorization')).toBe('Bearer tok');
  });

  it('returns null when there is no vault', async () => {
    expect(await client(fakeFetch(() => json({ files: [] })).fn).findVault()).toBeNull();
  });
});

describe('GoogleDriveClient errors', () => {
  it('throws AuthExpiredError without calling Drive when there is no token', async () => {
    const { fn, requests } = fakeFetch(() => json({}));
    await expect(client(fn, null).findVault()).rejects.toBeInstanceOf(AuthExpiredError);
    expect(requests).toHaveLength(0);
  });

  it('throws AuthExpiredError on HTTP 401', async () => {
    await expect(client(fakeFetch(() => json({}, 401)).fn).findVault()).rejects.toBeInstanceOf(AuthExpiredError);
  });

  it('throws DriveError carrying other HTTP statuses', async () => {
    const error = await client(fakeFetch(() => json({}, 500)).fn)
      .getVersion('f1')
      .catch((e) => e);
    expect(error).toBeInstanceOf(DriveError);
    expect(error).not.toBeInstanceOf(AuthExpiredError);
    expect(error.status).toBe(500);
  });
});

describe('GoogleDriveClient.getVersion / download', () => {
  it('reads the version field', async () => {
    const { fn, requests } = fakeFetch(() => json({ version: '12' }));
    expect(await client(fn).getVersion('f1')).toBe('12');
    expect(requests[0].url.pathname).toBe('/drive/v3/files/f1');
    expect(requests[0].url.searchParams.get('fields')).toBe('version');
  });

  it('downloads the content together with a stable version', async () => {
    const { fn, requests } = fakeFetch((req) =>
      req.url.searchParams.get('alt') === 'media' ? new Response('{"x":1}') : json({ version: '5' }),
    );
    expect(await client(fn).download('f1')).toEqual({ content: '{"x":1}', version: '5' });
    expect(requests.map((r) => r.url.searchParams.get('alt') ?? r.url.searchParams.get('fields'))).toEqual([
      'version',
      'media',
      'version',
    ]);
  });

  it('retries when the file changes during the download', async () => {
    const versions = ['1', '2', '2', '2'];
    let media = 0;
    const { fn } = fakeFetch((req) => {
      if (req.url.searchParams.get('alt') === 'media') return new Response(`content-${++media}`);
      return json({ version: versions.shift() });
    });
    expect(await client(fn).download('f1')).toEqual({ content: 'content-2', version: '2' });
  });
});

describe('GoogleDriveClient.create', () => {
  it('creates the PasswordVault folder when missing, then uploads the vault into it', async () => {
    const { fn, requests } = fakeFetch((req) => {
      if (req.method === 'GET') return json({ files: [] });
      if (req.url.pathname === '/drive/v3/files') return json({ id: 'folder-1' });
      return json({ id: 'f1', version: '1' });
    });
    expect(await client(fn).create('{"vault":true}')).toEqual({ id: 'f1', version: '1' });

    const [lookup, folder, upload] = requests;
    expect(lookup.url.searchParams.get('q')).toBe(
      "appProperties has { key='pwvault' and value='folder' } and trashed=false",
    );
    expect(folder.method).toBe('POST');
    expect(JSON.parse(folder.body)).toEqual({
      name: 'PasswordVault',
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { pwvault: 'folder' },
    });
    expect(upload.method).toBe('POST');
    expect(upload.url.origin + upload.url.pathname).toBe('https://www.googleapis.com/upload/drive/v3/files');
    expect(upload.url.searchParams.get('uploadType')).toBe('multipart');
    expect(upload.headers.get('Content-Type')).toMatch(/^multipart\/related; boundary=/);
    expect(upload.body).toContain(
      JSON.stringify({ name: 'vault.enc', parents: ['folder-1'], mimeType: 'application/json', appProperties: { pwvault: '1' } }),
    );
    expect(upload.body).toContain('{"vault":true}');
  });

  it('reuses an existing folder', async () => {
    const { fn, requests } = fakeFetch((req) =>
      req.method === 'GET' ? json({ files: [{ id: 'folder-9' }] }) : json({ id: 'f1', version: '1' }),
    );
    await client(fn).create('{}');
    expect(requests).toHaveLength(2);
    expect(requests[1].body).toContain('"parents":["folder-9"]');
  });
});

describe('GoogleDriveClient.update', () => {
  it('replaces the file content and returns the new version', async () => {
    const { fn, requests } = fakeFetch(() => json({ id: 'f1', version: '8' }));
    expect(await client(fn).update('f1', '{"new":1}')).toEqual({ id: 'f1', version: '8' });
    const req = requests[0];
    expect(req.method).toBe('PATCH');
    expect(req.url.origin + req.url.pathname).toBe('https://www.googleapis.com/upload/drive/v3/files/f1');
    expect(req.url.searchParams.get('uploadType')).toBe('media');
    expect(req.url.searchParams.get('fields')).toBe('id,version');
    expect(req.body).toBe('{"new":1}');
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/storage/driveClient.test.ts`
Expected: FAIL，找不到模組 `../../src/storage/driveClient`

- [ ] **Step 3: 實作 `src/storage/driveClient.ts`**

```ts
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const VAULT_QUERY = "appProperties has { key='pwvault' and value='1' } and trashed=false";
const FOLDER_QUERY = "appProperties has { key='pwvault' and value='folder' } and trashed=false";
const DOWNLOAD_ATTEMPTS = 3;

export const VAULT_FILE_NAME = 'vault.enc';
export const VAULT_FOLDER_NAME = 'PasswordVault';

export class DriveError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`Google Drive 錯誤 ${status}：${detail}`);
    this.name = 'DriveError';
  }
}

export class AuthExpiredError extends DriveError {
  constructor() {
    super(401, '登入已過期，請重新登入 Google');
    this.name = 'AuthExpiredError';
  }
}

export interface RemoteFile {
  id: string;
  /** Drive 的檔案版本號（單調遞增的數字字串）。 */
  version: string;
}

export interface DriveClient {
  findVault(): Promise<RemoteFile | null>;
  getVersion(fileId: string): Promise<string>;
  download(fileId: string): Promise<{ content: string; version: string }>;
  create(content: string): Promise<RemoteFile>;
  update(fileId: string, content: string): Promise<RemoteFile>;
}

export class GoogleDriveClient implements DriveClient {
  constructor(
    private readonly getToken: () => string | null,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const token = this.getToken();
    if (!token) throw new AuthExpiredError();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const res = await this.fetchFn(url, { ...init, headers });
    if (res.status === 401) throw new AuthExpiredError();
    if (!res.ok) throw new DriveError(res.status, await res.text());
    return res;
  }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    return (await (await this.request(url, init)).json()) as T;
  }

  private fileUrl(base: string, fileId: string, params: Record<string, string>): string {
    return `${base}/files/${encodeURIComponent(fileId)}?${new URLSearchParams(params)}`;
  }

  async findVault(): Promise<RemoteFile | null> {
    const params = new URLSearchParams({
      q: VAULT_QUERY,
      spaces: 'drive',
      orderBy: 'modifiedTime desc',
      fields: 'files(id,version)',
    });
    const body = await this.json<{ files?: RemoteFile[] }>(`${API}/files?${params}`);
    return body.files?.[0] ?? null;
  }

  async getVersion(fileId: string): Promise<string> {
    const body = await this.json<{ version: string }>(this.fileUrl(API, fileId, { fields: 'version' }));
    return body.version;
  }

  /** alt=media 不會回傳版本號，所以下載前後各查一次；兩次不同代表下載途中被改動，重試。 */
  async download(fileId: string): Promise<{ content: string; version: string }> {
    for (let attempt = 0; attempt < DOWNLOAD_ATTEMPTS; attempt++) {
      const before = await this.getVersion(fileId);
      const content = await (await this.request(this.fileUrl(API, fileId, { alt: 'media' }))).text();
      const after = await this.getVersion(fileId);
      if (before === after) return { content, version: after };
    }
    throw new DriveError(409, '檔案持續變動中，請稍後再試');
  }

  async create(content: string): Promise<RemoteFile> {
    const folderId = await this.ensureFolder();
    const boundary = `pwvault-${crypto.randomUUID()}`;
    const metadata = {
      name: VAULT_FILE_NAME,
      parents: [folderId],
      mimeType: 'application/json',
      appProperties: { pwvault: '1' },
    };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
    return this.json<RemoteFile>(`${UPLOAD}/files?uploadType=multipart&fields=id,version`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
  }

  async update(fileId: string, content: string): Promise<RemoteFile> {
    return this.json<RemoteFile>(this.fileUrl(UPLOAD, fileId, { uploadType: 'media', fields: 'id,version' }), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: content,
    });
  }

  private async ensureFolder(): Promise<string> {
    const params = new URLSearchParams({ q: FOLDER_QUERY, spaces: 'drive', fields: 'files(id)' });
    const found = await this.json<{ files?: { id: string }[] }>(`${API}/files?${params}`);
    if (found.files?.[0]) return found.files[0].id;
    const created = await this.json<{ id: string }>(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: VAULT_FOLDER_NAME, mimeType: FOLDER_MIME, appProperties: { pwvault: 'folder' } }),
    });
    return created.id;
  }
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run tests/storage/driveClient.test.ts`
Expected: PASS（11 tests）

- [ ] **Step 5: Commit**

```bash
git add src/storage/driveClient.ts tests/storage/driveClient.test.ts
git commit -m "feat(storage): add Google Drive REST client"
```

---

### Task 2: 改用 driveClient，移除 drive.ts

**Files:**
- Delete: `src/storage/drive.ts`, `tests/storage/drive.test.ts`
- Modify: `src/App.svelte`

- [ ] **Step 1: 刪除舊檔**

```bash
git rm src/storage/drive.ts tests/storage/drive.test.ts
```

- [ ] **Step 2: 修改 `src/App.svelte` 的 script 區塊**

把 `import { findVaultFiles } from './storage/drive';` 換成：
```ts
  import { GoogleDriveClient } from './storage/driveClient';
```

在 `let driveResult = $state('');` 之後加上：
```ts
  const drive = new GoogleDriveClient(() => auth.current()?.value ?? null);
```

把 `testDrive` 換成：
```ts
  async function testDrive() {
    driveResult = '查詢中…';
    try {
      const vault = await drive.findVault();
      driveResult = vault ? `成功：找到保險庫（版本 ${vault.version}）` : '成功：雲端尚未建立保險庫';
    } catch (e) {
      driveResult = `失敗：${(e as Error).message}`;
    }
  }
```

- [ ] **Step 3: 驗證**

Run: `npm run check`、`npm test`
Expected: 0 errors；全部通過

- [ ] **Step 4: Commit**

```bash
git add -A src/App.svelte src/storage tests/storage
git commit -m "refactor: use DriveClient in the login prototype"
```

---

### Task 3: FakeDrive

**Files:**
- Create: `src/storage/fakeDrive.ts`

- [ ] **Step 1: 實作**

```ts
import { DriveError, type DriveClient, type RemoteFile } from './driveClient';

/** 記憶體版 Drive。多個 UnlockedVault 共用同一個實例，就能模擬多台裝置。 */
export class FakeDrive implements DriveClient {
  readonly files = new Map<string, { content: string; version: number }>();
  /** 每次呼叫的方法名稱，供測試檢查。 */
  readonly calls: string[] = [];
  /** 設定後，下一次呼叫會丟出這個錯誤（模擬斷線）。 */
  failNext: Error | null = null;
  private nextId = 1;

  private enter(op: string): void {
    this.calls.push(op);
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
  }

  private file(id: string) {
    const f = this.files.get(id);
    if (!f) throw new DriveError(404, `找不到檔案 ${id}`);
    return f;
  }

  async findVault(): Promise<RemoteFile | null> {
    this.enter('findVault');
    for (const [id, f] of this.files) return { id, version: String(f.version) };
    return null;
  }

  async getVersion(fileId: string): Promise<string> {
    this.enter('getVersion');
    return String(this.file(fileId).version);
  }

  async download(fileId: string): Promise<{ content: string; version: string }> {
    this.enter('download');
    const f = this.file(fileId);
    return { content: f.content, version: String(f.version) };
  }

  async create(content: string): Promise<RemoteFile> {
    this.enter('create');
    const id = `file-${this.nextId++}`;
    this.files.set(id, { content, version: 1 });
    return { id, version: '1' };
  }

  async update(fileId: string, content: string): Promise<RemoteFile> {
    this.enter('update');
    const f = this.file(fileId);
    f.content = content;
    f.version++;
    return { id: fileId, version: String(f.version) };
  }
}
```

- [ ] **Step 2: 型別檢查**

Run: `npm run check`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/storage/fakeDrive.ts
git commit -m "test(storage): add in-memory FakeDrive"
```

---

### Task 4: syncService

**Files:**
- Create: `src/storage/syncService.ts`
- Test: `tests/storage/syncService.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```ts
import { describe, expect, it } from 'vitest';
import type { Resolution } from '../../src/core/merge';
import { addEntry, updateEntry, type VaultData } from '../../src/core/model';
import { generateRecoveryCode } from '../../src/core/recoveryCode';
import { WrongSecretError } from '../../src/core/vaultFile';
import { FakeDrive } from '../../src/storage/fakeDrive';
import {
  VaultLockedError,
  createVault,
  locateVault,
  unlockVault,
  type ConflictResolver,
  type UnlockedVault,
} from '../../src/storage/syncService';
import { FAST_KDF, makeEntry } from '../helpers';

const PASSWORD = 'Correct-Horse-Battery-9';
const NEW_PASSWORD = 'New-Password-Is-Long-42';

/** 每次呼叫前進 1 秒，確保每次修改的 updatedAt 都不同。 */
function tickingClock() {
  let t = Date.UTC(2026, 9, 1);
  return () => new Date((t += 1000));
}

const noConflicts: ConflictResolver = async (conflicts) => {
  throw new Error(`預期不會有衝突，卻收到 ${conflicts.length} 個`);
};

const fields = { url: '', username: 'me', password: 'pw', notes: '', tags: [] };
const add = (title: string, id: string) => (d: VaultData, now: Date) => addEntry(d, { ...fields, title }, now, id).data;
const titles = (v: UnlockedVault) => v.data.entries.map((e) => e.title).sort();

async function openAs(drive: FakeDrive, clock: () => Date, secret = PASSWORD, type: 'password' | 'recovery' = 'password') {
  const locked = await locateVault(drive);
  if (!locked) throw new Error('找不到保險庫');
  return unlockVault(drive, locked, type, secret, clock);
}

async function setup() {
  const drive = new FakeDrive();
  const clock = tickingClock();
  const recovery = generateRecoveryCode();
  const a = await createVault(drive, PASSWORD, recovery, clock, FAST_KDF);
  const b = await openAs(drive, clock);
  return { drive, clock, recovery, a, b };
}

describe('create / locate / unlock', () => {
  it('returns null when there is no vault yet', async () => {
    expect(await locateVault(new FakeDrive())).toBeNull();
  });

  it('creates a vault that another device can unlock and read', async () => {
    const { drive, clock, a } = await setup();
    await a.apply(add('GitHub', 'gh'), noConflicts);
    expect(titles(await openAs(drive, clock))).toEqual(['GitHub']);
  });

  it('unlocks with the recovery code', async () => {
    const { drive, clock, recovery } = await setup();
    const v = await openAs(drive, clock, recovery, 'recovery');
    expect(v.data.entries).toEqual([]);
  });

  it('rejects a wrong password', async () => {
    const { drive, clock } = await setup();
    await expect(openAs(drive, clock, 'wrong-password')).rejects.toBeInstanceOf(WrongSecretError);
  });
});

describe('apply / sync', () => {
  it('does not upload when nothing changed', async () => {
    const { drive, a } = await setup();
    const uploads = () => drive.calls.filter((c) => c === 'update').length;
    const before = uploads();
    expect(await a.apply((d) => d, noConflicts)).toEqual({ pulled: false, pushed: false });
    expect(uploads()).toBe(before);
  });

  it('reports nothing to do when the remote did not change', async () => {
    const { a } = await setup();
    expect(await a.sync(noConflicts)).toEqual({ pulled: false, pushed: false });
  });

  it('merges edits to different entries made on two devices', async () => {
    const { drive, clock, a, b } = await setup();
    await a.apply(add('From A', 'a1'), noConflicts);
    expect(await b.apply(add('From B', 'b1'), noConflicts)).toEqual({ pulled: true, pushed: true });
    expect(titles(await openAs(drive, clock))).toEqual(['From A', 'From B']);
    expect(await a.sync(noConflicts)).toEqual({ pulled: true, pushed: false });
    expect(titles(a)).toEqual(['From A', 'From B']);
  });

  it('asks the resolver when both devices edited the same entry', async () => {
    const { drive, clock, a, b } = await setup();
    await a.apply(add('Shared', 's1'), noConflicts);
    await b.sync(noConflicts);
    await a.apply((d, now) => updateEntry(d, 's1', { password: 'from-a' }, now), noConflicts);

    const seen: { local?: string; remote?: string }[] = [];
    const resolver: ConflictResolver = async (conflicts) => {
      const answers: Record<string, Resolution> = {};
      for (const c of conflicts) {
        seen.push({ local: c.local?.password, remote: c.remote?.password });
        answers[c.id] = 'local';
      }
      return answers;
    };
    await b.apply((d, now) => updateEntry(d, 's1', { password: 'from-b' }, now), resolver);

    expect(seen).toEqual([{ local: 'from-b', remote: 'from-a' }]);
    const fresh = await openAs(drive, clock);
    expect(fresh.data.entries.find((e) => e.id === 's1')?.password).toBe('from-b');
  });

  it('keeps local changes after a failed save and pushes them on the next sync', async () => {
    const { drive, clock, a } = await setup();
    drive.failNext = new Error('offline');
    await expect(a.apply(add('Offline', 'o1'), noConflicts)).rejects.toThrow('offline');
    expect(titles(a)).toEqual(['Offline']);
    expect(await a.sync(noConflicts)).toEqual({ pulled: false, pushed: true });
    expect(titles(await openAs(drive, clock))).toEqual(['Offline']);
  });

  it('purges expired trash when saving', async () => {
    const { a } = await setup();
    await a.apply(
      (d) => ({ ...d, entries: [...d.entries, makeEntry({ id: 'old', trashedAt: '2020-01-01T00:00:00.000Z' })] }),
      noConflicts,
    );
    expect(a.data.entries).toEqual([]);
    expect(a.data.tombstones.map((t) => t.id)).toEqual(['old']);
  });
});

describe('changeSecret', () => {
  it('changes the master password', async () => {
    const { drive, clock, a } = await setup();
    await a.changeSecret('password', NEW_PASSWORD, noConflicts);
    await expect(openAs(drive, clock, PASSWORD)).rejects.toBeInstanceOf(WrongSecretError);
    expect((await openAs(drive, clock, NEW_PASSWORD)).data.entries).toEqual([]);
  });

  it('lets another device keep saving after the password changed', async () => {
    const { drive, clock, a, b } = await setup();
    await a.changeSecret('password', NEW_PASSWORD, noConflicts);
    await b.apply(add('After change', 'x1'), noConflicts);
    const fresh = await openAs(drive, clock, NEW_PASSWORD);
    expect(titles(fresh)).toEqual(['After change']);
  });

  it('replaces the recovery code', async () => {
    const { drive, clock, a, recovery } = await setup();
    const next = generateRecoveryCode();
    await a.changeSecret('recovery', next, noConflicts);
    await expect(openAs(drive, clock, recovery, 'recovery')).rejects.toBeInstanceOf(WrongSecretError);
    expect((await openAs(drive, clock, next, 'recovery')).data.entries).toEqual([]);
  });
});

describe('lock', () => {
  it('forgets the decrypted data', async () => {
    const { a } = await setup();
    a.lock();
    expect(a.locked).toBe(true);
    expect(() => a.data).toThrow(VaultLockedError);
    await expect(a.sync(noConflicts)).rejects.toBeInstanceOf(VaultLockedError);
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/storage/syncService.test.ts`
Expected: FAIL，找不到模組 `../../src/storage/syncService`

- [ ] **Step 3: 實作 `src/storage/syncService.ts`**

```ts
import { DEFAULT_KDF, type KdfParams } from '../core/crypto';
import { mergeVaults, resolveConflicts, type Conflict, type Resolution } from '../core/merge';
import { cleanup, emptyVault, type VaultData } from '../core/model';
import {
  createVaultFile,
  parseVaultFile,
  readPayload,
  replaceKeySlot,
  serializeVaultFile,
  unlockVaultFile,
  writePayload,
  type KeySlotType,
  type VaultFile,
} from '../core/vaultFile';
import type { DriveClient } from './driveClient';

const MAX_SYNC_ATTEMPTS = 3;

/** 由 UI 實作：顯示衝突對照畫面，回傳每個衝突項目的選擇。 */
export type ConflictResolver = (conflicts: Conflict[]) => Promise<Record<string, Resolution>>;

export interface SyncOutcome {
  /** 是否從雲端拉下了別台裝置的修改。 */
  pulled: boolean;
  /** 是否上傳了本機的修改。 */
  pushed: boolean;
}

export interface LockedVault {
  fileId: string;
  version: string;
  file: VaultFile;
}

export class VaultLockedError extends Error {
  constructor() {
    super('保險庫已鎖定');
    this.name = 'VaultLockedError';
  }
}

type Clock = () => Date;
const systemClock: Clock = () => new Date();

export async function locateVault(drive: DriveClient): Promise<LockedVault | null> {
  const remote = await drive.findVault();
  if (!remote) return null;
  const { content, version } = await drive.download(remote.id);
  return { fileId: remote.id, version, file: parseVaultFile(content) };
}

export async function createVault(
  drive: DriveClient,
  password: string,
  recoveryCode: string,
  clock: Clock = systemClock,
  kdf: KdfParams = DEFAULT_KDF,
): Promise<UnlockedVault> {
  const data = emptyVault();
  const { file, dek } = await createVaultFile(data, password, recoveryCode, kdf);
  const remote = await drive.create(serializeVaultFile(file));
  return new UnlockedVault(drive, clock, remote.id, remote.version, file, dek, data);
}

export async function unlockVault(
  drive: DriveClient,
  locked: LockedVault,
  type: KeySlotType,
  secret: string,
  clock: Clock = systemClock,
): Promise<UnlockedVault> {
  const dek = await unlockVaultFile(locked.file, type, secret);
  const data = await readPayload(locked.file, dek);
  return new UnlockedVault(drive, clock, locked.fileId, locked.version, locked.file, dek, data);
}

function sameData(a: VaultData, b: VaultData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class UnlockedVault {
  private dek: CryptoKey | null;
  /** 最後一次與雲端一致的內容，作為三方合併的共同基準。 */
  private base: VaultData;
  private current: VaultData;

  constructor(
    private readonly drive: DriveClient,
    private readonly clock: Clock,
    readonly fileId: string,
    private baseVersion: string,
    private file: VaultFile,
    dek: CryptoKey,
    data: VaultData,
  ) {
    this.dek = dek;
    this.base = data;
    this.current = data;
  }

  get locked(): boolean {
    return this.dek === null;
  }

  get data(): VaultData {
    this.key();
    return this.current;
  }

  private key(): CryptoKey {
    if (!this.dek) throw new VaultLockedError();
    return this.dek;
  }

  /** 套用本機修改後立即同步。上傳失敗時修改仍保留在記憶體中，下次同步會一併送出。 */
  async apply(mutate: (data: VaultData, now: Date) => VaultData, resolve: ConflictResolver): Promise<SyncOutcome> {
    this.key();
    this.current = mutate(this.current, this.clock());
    return this.sync(resolve);
  }

  async sync(resolve: ConflictResolver): Promise<SyncOutcome> {
    this.key();
    let pulled = false;
    for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt++) {
      const remoteVersion = await this.drive.getVersion(this.fileId);
      if (remoteVersion !== this.baseVersion) {
        await this.pull(resolve);
        pulled = true;
        continue;
      }
      this.current = cleanup(this.current, this.clock());
      if (sameData(this.current, this.base)) return { pulled, pushed: false };
      await this.push(this.file);
      return { pulled, pushed: true };
    }
    throw new Error('雲端檔案持續變動中，請稍後再試');
  }

  /** 修改主密碼或救援碼。先同步確保內容最新，再以新的金鑰槽上傳。 */
  async changeSecret(type: KeySlotType, secret: string, resolve: ConflictResolver): Promise<void> {
    for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt++) {
      await this.sync(resolve);
      if ((await this.drive.getVersion(this.fileId)) !== this.baseVersion) continue;
      await this.push(await replaceKeySlot(this.file, this.key(), this.current, type, secret));
      return;
    }
    throw new Error('雲端檔案持續變動中，請稍後再試');
  }

  /** 釋放金鑰與明文資料的參照。JavaScript 無法保證記憶體立即被抹除。 */
  lock(): void {
    this.dek = null;
    this.base = emptyVault();
    this.current = emptyVault();
  }

  private async pull(resolve: ConflictResolver): Promise<void> {
    const dek = this.key();
    const { content, version } = await this.drive.download(this.fileId);
    // 別台裝置可能換過主密碼：DEK 不變，但標頭（金鑰槽）要改用雲端版本。
    const remoteFile = parseVaultFile(content);
    const remoteData = await readPayload(remoteFile, dek);
    const result = mergeVaults(this.base, this.current, remoteData);
    const merged = result.conflicts.length
      ? resolveConflicts(result, await resolve(result.conflicts), this.clock())
      : result.data;
    this.file = remoteFile;
    this.base = remoteData;
    this.baseVersion = version;
    this.current = merged;
  }

  /** 以 file 的標頭加密目前內容並上傳。 */
  private async push(file: VaultFile): Promise<void> {
    const sealed = await writePayload(file, this.key(), this.current);
    const remote = await this.drive.update(this.fileId, serializeVaultFile(sealed));
    this.file = sealed;
    this.base = this.current;
    this.baseVersion = remote.version;
  }
}
```

注意 `changeSecret` 呼叫 `push(replaceKeySlot(...))`：`replaceKeySlot` 回傳的檔案已經用新的標頭加密過 payload，`push` 會再以同一個標頭重新加密一次（新的 IV），結果一樣正確。

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run tests/storage/syncService.test.ts`
Expected: PASS（14 tests）

- [ ] **Step 5: 全部驗證並 Commit**

Run: `npm test`、`npm run check`
Expected: 全部通過；0 errors

```bash
git add src/storage/syncService.ts tests/storage/syncService.test.ts
git commit -m "feat(storage): add vault sync service with three-way merge"
git push
```

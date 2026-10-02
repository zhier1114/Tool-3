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
  /**
   * 內容標記：只有檔案內容改變時才會改變。實作上是 Drive 的 md5Checksum，
   * 而不是 Drive 的 version——後者連背景處理等使用者看不到的 metadata 變動也會遞增，
   * 會讓沒有其他裝置時也誤判雲端被改過。
   */
  version: string;
}

/** 向 Drive 要內容標記時用的欄位名稱，見 RemoteFile.version。 */
const TAG = 'md5Checksum';

type DriveFile = { id: string; [TAG]: string };
const toRemote = (f: DriveFile): RemoteFile => ({ id: f.id, version: f[TAG] });

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
      fields: `files(id,${TAG})`,
    });
    const body = await this.json<{ files?: DriveFile[] }>(`${API}/files?${params}`);
    const first = body.files?.[0];
    return first ? toRemote(first) : null;
  }

  async getVersion(fileId: string): Promise<string> {
    const body = await this.json<Pick<DriveFile, typeof TAG>>(this.fileUrl(API, fileId, { fields: TAG }));
    return body[TAG];
  }

  /** alt=media 不會回傳內容標記，所以下載前後各查一次；兩次不同代表下載途中被改動，重試。 */
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
    const created = await this.json<DriveFile>(`${UPLOAD}/files?uploadType=multipart&fields=id,${TAG}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return toRemote(created);
  }

  async update(fileId: string, content: string): Promise<RemoteFile> {
    const updated = await this.json<DriveFile>(this.fileUrl(UPLOAD, fileId, { uploadType: 'media', fields: `id,${TAG}` }), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: content,
    });
    return toRemote(updated);
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

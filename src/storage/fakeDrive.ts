import { DriveError, type DriveClient, type RemoteFile } from './driveClient';

/** 以內容算出標記，模擬 Drive 的 md5Checksum：內容不變，標記就不變。 */
function contentTag(content: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) h = Math.imul(h ^ content.charCodeAt(i), 0x01000193);
  return `${(h >>> 0).toString(16)}-${content.length}`;
}

/** 記憶體版 Drive。多個 UnlockedVault 共用同一個實例，就能模擬多台裝置。 */
export class FakeDrive implements DriveClient {
  readonly files = new Map<string, { content: string }>();
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

  /** 模擬 Drive 在背景更動 metadata（真實 Drive 的 version 會因此遞增），內容不變。 */
  touch(fileId: string): void {
    this.file(fileId);
  }

  async findVault(): Promise<RemoteFile | null> {
    this.enter('findVault');
    for (const [id, f] of this.files) return { id, version: contentTag(f.content) };
    return null;
  }

  async getVersion(fileId: string): Promise<string> {
    this.enter('getVersion');
    return contentTag(this.file(fileId).content);
  }

  async download(fileId: string): Promise<{ content: string; version: string }> {
    this.enter('download');
    const f = this.file(fileId);
    return { content: f.content, version: contentTag(f.content) };
  }

  async create(content: string): Promise<RemoteFile> {
    this.enter('create');
    const id = `file-${this.nextId++}`;
    this.files.set(id, { content });
    return { id, version: contentTag(content) };
  }

  async update(fileId: string, content: string): Promise<RemoteFile> {
    this.enter('update');
    this.file(fileId).content = content;
    return { id: fileId, version: contentTag(content) };
  }
}

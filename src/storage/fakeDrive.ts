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

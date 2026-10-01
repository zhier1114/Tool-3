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

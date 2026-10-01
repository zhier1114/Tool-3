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

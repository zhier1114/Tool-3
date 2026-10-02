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
  /** 有星號的項目在列表置頂。舊資料沒有這個欄位，視為 false。 */
  starred?: boolean;
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

export function setStarred(data: VaultData, id: string, starred: boolean, now: Date): VaultData {
  return mapEntry(data, id, (e) => (!!e.starred === starred ? e : { ...e, starred, updatedAt: now.toISOString() }));
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

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
      e.passwordHistory.map((h) => [h.password, h.changedAt]), e.trashedAt, !!e.starred,
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

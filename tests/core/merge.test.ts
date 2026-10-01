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

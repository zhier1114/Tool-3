import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  activeEntries,
  addEntry,
  allTags,
  cleanup,
  daysLeftInTrash,
  emptyVault,
  purgeEntry,
  restoreEntry,
  setStarred,
  trashEntry,
  trashedEntries,
  updateEntry,
} from '../../src/core/model';
import { makeEntry, vaultOf } from '../helpers';

const NOW = new Date('2026-10-01T00:00:00.000Z');
const LATER = new Date('2026-10-02T00:00:00.000Z');
const DAY = 86_400_000;
const daysBefore = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

describe('addEntry', () => {
  it('creates a trimmed entry with normalized tags', () => {
    const before = emptyVault();
    const { data, entry } = addEntry(
      before,
      {
        title: ' GitHub ',
        url: ' https://github.com ',
        username: 'me',
        password: 'p1',
        notes: 'n',
        tags: ['work', ' work ', '', 'dev'],
      },
      NOW,
      'id-1',
    );
    expect(entry).toEqual({
      id: 'id-1',
      title: 'GitHub',
      url: 'https://github.com',
      username: 'me',
      password: 'p1',
      notes: 'n',
      tags: ['work', 'dev'],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      passwordHistory: [],
      trashedAt: null,
    });
    expect(data.entries).toEqual([entry]);
    expect(before.entries).toEqual([]);
  });
});

describe('updateEntry', () => {
  it('updates fields and bumps updatedAt', () => {
    const data = updateEntry(vaultOf(makeEntry()), 'e1', { title: 'New' }, LATER);
    expect(data.entries[0].title).toBe('New');
    expect(data.entries[0].updatedAt).toBe(LATER.toISOString());
  });

  it('returns the same object when nothing changes', () => {
    const before = vaultOf(makeEntry());
    expect(updateEntry(before, 'e1', { title: 'GitHub', tags: [] }, LATER)).toBe(before);
  });

  it('moves the old password into history', () => {
    const data = updateEntry(vaultOf(makeEntry()), 'e1', { password: 'new-pass' }, LATER);
    expect(data.entries[0].password).toBe('new-pass');
    expect(data.entries[0].passwordHistory).toEqual([{ password: 'old-pass', changedAt: LATER.toISOString() }]);
  });

  it('does not record an empty previous password', () => {
    const data = updateEntry(vaultOf(makeEntry({ password: '' })), 'e1', { password: 'first' }, LATER);
    expect(data.entries[0].passwordHistory).toEqual([]);
  });

  it('keeps at most HISTORY_LIMIT old passwords, newest first', () => {
    let data = vaultOf(makeEntry({ password: 'p0' }));
    for (let i = 1; i <= HISTORY_LIMIT + 2; i++) {
      data = updateEntry(data, 'e1', { password: `p${i}` }, new Date(NOW.getTime() + i * 1000));
    }
    const history = data.entries[0].passwordHistory;
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0].password).toBe(`p${HISTORY_LIMIT + 1}`);
    expect(history[HISTORY_LIMIT - 1].password).toBe('p2');
  });

  it('throws for an unknown id', () => {
    expect(() => updateEntry(vaultOf(), 'missing', { title: 'x' }, NOW)).toThrow();
  });
});

describe('trash', () => {
  it('moves an entry to the trash and back', () => {
    const trashed = trashEntry(vaultOf(makeEntry()), 'e1', NOW);
    expect(trashed.entries[0].trashedAt).toBe(NOW.toISOString());
    expect(trashed.entries[0].updatedAt).toBe(NOW.toISOString());
    expect(activeEntries(trashed)).toEqual([]);
    expect(trashedEntries(trashed)).toHaveLength(1);

    const restored = restoreEntry(trashed, 'e1', LATER);
    expect(restored.entries[0].trashedAt).toBeNull();
    expect(restored.entries[0].updatedAt).toBe(LATER.toISOString());
    expect(activeEntries(restored)).toHaveLength(1);
  });

  it('purgeEntry removes the entry and leaves a tombstone', () => {
    const data = purgeEntry(vaultOf(makeEntry()), 'e1', NOW);
    expect(data.entries).toEqual([]);
    expect(data.tombstones).toEqual([{ id: 'e1', deletedAt: NOW.toISOString() }]);
  });

  it('daysLeftInTrash counts down from 30', () => {
    expect(daysLeftInTrash(makeEntry({ trashedAt: NOW.toISOString() }), NOW)).toBe(30);
    expect(daysLeftInTrash(makeEntry({ trashedAt: daysBefore(29.5) }), NOW)).toBe(1);
    expect(daysLeftInTrash(makeEntry({ trashedAt: daysBefore(31) }), NOW)).toBe(0);
  });
});

describe('cleanup', () => {
  it('purges entries trashed 30+ days ago and drops tombstones older than 365 days', () => {
    const data = {
      schemaVersion: 1 as const,
      entries: [
        makeEntry({ id: 'old', trashedAt: daysBefore(30) }),
        makeEntry({ id: 'recent', trashedAt: daysBefore(29) }),
        makeEntry({ id: 'active' }),
      ],
      tombstones: [
        { id: 't-old', deletedAt: daysBefore(366) },
        { id: 't-new', deletedAt: daysBefore(364) },
      ],
    };
    const result = cleanup(data, NOW);
    expect(result.entries.map((e) => e.id)).toEqual(['recent', 'active']);
    expect(result.tombstones).toEqual([
      { id: 't-new', deletedAt: daysBefore(364) },
      { id: 'old', deletedAt: NOW.toISOString() },
    ]);
  });

  it('returns the same object when there is nothing to clean', () => {
    const data = vaultOf(makeEntry());
    expect(cleanup(data, NOW)).toBe(data);
  });
});

describe('allTags', () => {
  it('lists unique tags of active entries, sorted', () => {
    const data = vaultOf(
      makeEntry({ id: 'a', tags: ['work', 'dev'] }),
      makeEntry({ id: 'b', tags: ['bank', 'work'] }),
      makeEntry({ id: 'c', tags: ['hidden'], trashedAt: NOW.toISOString() }),
    );
    expect(allTags(data)).toEqual(['bank', 'dev', 'work']);
  });
});

describe('setStarred', () => {
  it('stars an entry and bumps updatedAt', () => {
    const data = vaultOf(makeEntry());
    const next = setStarred(data, 'e1', true, NOW);
    expect(next.entries[0].starred).toBe(true);
    expect(next.entries[0].updatedAt).toBe(NOW.toISOString());
  });

  it('unstars an entry', () => {
    const data = vaultOf(makeEntry({ starred: true }));
    expect(setStarred(data, 'e1', false, NOW).entries[0].starred).toBe(false);
  });

  it('returns the same object when nothing changes', () => {
    const data = vaultOf(makeEntry());
    expect(setStarred(data, 'e1', false, NOW)).toBe(data);
    const starred = vaultOf(makeEntry({ starred: true }));
    expect(setStarred(starred, 'e1', true, NOW)).toBe(starred);
  });

  it('keeps the star through trash and restore', () => {
    const data = vaultOf(makeEntry({ starred: true }));
    const restored = restoreEntry(trashEntry(data, 'e1', NOW), 'e1', LATER);
    expect(restored.entries[0].starred).toBe(true);
  });
});

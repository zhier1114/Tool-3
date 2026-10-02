import { describe, expect, it } from 'vitest';
import { searchEntries, sortEntries } from '../../src/core/query';
import { makeEntry } from '../helpers';

const entries = [
  makeEntry({ id: 'gh', title: 'GitHub', url: 'https://github.com', username: 'dev@mail.com', tags: ['work'], updatedAt: '2026-03-01T00:00:00.000Z' }),
  makeEntry({ id: 'bank', title: '玉山銀行', url: 'https://esunbank.com', username: 'A123', tags: ['bank'], updatedAt: '2026-05-01T00:00:00.000Z' }),
  makeEntry({ id: 'steam', title: 'Steam', url: 'https://store.steampowered.com', username: 'gamer', tags: ['game', 'work'], updatedAt: '2026-01-01T00:00:00.000Z' }),
];
const ids = (list: { id: string }[]) => list.map((e) => e.id);

describe('searchEntries', () => {
  it('returns everything for an empty query', () => {
    expect(ids(searchEntries(entries, '  '))).toEqual(['gh', 'bank', 'steam']);
  });

  it('matches title, url, username and tags case-insensitively', () => {
    expect(ids(searchEntries(entries, 'github'))).toEqual(['gh']);
    expect(ids(searchEntries(entries, 'ESUN'))).toEqual(['bank']);
    expect(ids(searchEntries(entries, 'gamer'))).toEqual(['steam']);
    expect(ids(searchEntries(entries, 'game'))).toEqual(['steam']);
    expect(ids(searchEntries(entries, '銀行'))).toEqual(['bank']);
  });

  it('requires every term to match', () => {
    expect(ids(searchEntries(entries, 'work steam'))).toEqual(['steam']);
  });

  it('does not search passwords or notes', () => {
    const secret = [makeEntry({ id: 'x', password: 'needle', notes: 'needle' })];
    expect(searchEntries(secret, 'needle')).toEqual([]);
  });

  it('filters by tag', () => {
    expect(ids(searchEntries(entries, '', 'work'))).toEqual(['gh', 'steam']);
    expect(ids(searchEntries(entries, 'git', 'work'))).toEqual(['gh']);
  });
});

describe('sortEntries', () => {
  it('sorts by most recently updated', () => {
    expect(ids(sortEntries(entries, 'updated'))).toEqual(['bank', 'gh', 'steam']);
  });

  it('sorts by title', () => {
    expect(ids(sortEntries(entries, 'title'))).toEqual(['bank', 'gh', 'steam']);
  });

  it('does not mutate the input', () => {
    const copy = [...entries];
    sortEntries(entries, 'updated');
    expect(entries).toEqual(copy);
  });

  it('puts starred entries first, keeping the sort mode within each group', () => {
    const list = [
      makeEntry({ id: 'a', title: 'A', updatedAt: '2026-01-01T00:00:00.000Z', starred: true }),
      makeEntry({ id: 'b', title: 'B', updatedAt: '2026-04-01T00:00:00.000Z' }),
      makeEntry({ id: 'c', title: 'C', updatedAt: '2026-03-01T00:00:00.000Z', starred: true }),
      makeEntry({ id: 'd', title: 'D', updatedAt: '2026-02-01T00:00:00.000Z' }),
    ];
    expect(ids(sortEntries(list, 'updated'))).toEqual(['c', 'a', 'b', 'd']);
    expect(ids(sortEntries(list, 'title'))).toEqual(['a', 'c', 'b', 'd']);
  });
});

import type { Entry } from './model';

export type SortMode = 'updated' | 'title';

/** 以空白分隔的每個關鍵字都必須出現在標題、網站、帳號或標籤之一（不分大小寫）。 */
export function searchEntries(entries: readonly Entry[], query: string, tag: string | null = null): Entry[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    if (tag !== null && !e.tags.includes(tag)) return false;
    const fields = [e.title, e.url, e.username, ...e.tags].map((f) => f.toLowerCase());
    return terms.every((t) => fields.some((f) => f.includes(t)));
  });
}

/** 有星號的排前面；兩群內各自依 mode 排序。 */
export function sortEntries(entries: readonly Entry[], mode: SortMode): Entry[] {
  const byStar = (a: Entry, b: Entry) => Number(!!b.starred) - Number(!!a.starred);
  const byUpdated = (a: Entry, b: Entry) => b.updatedAt.localeCompare(a.updatedAt);
  const byTitle = (a: Entry, b: Entry) =>
    a.title.localeCompare(b.title, 'zh-Hant', { sensitivity: 'base' }) || byUpdated(a, b);
  const byMode = mode === 'updated' ? byUpdated : byTitle;
  return [...entries].sort((a, b) => byStar(a, b) || byMode(a, b));
}

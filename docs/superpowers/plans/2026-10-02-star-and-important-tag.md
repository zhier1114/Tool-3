# 星號置頂與「重要」標籤排最前 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作 `docs/superpowers/specs/2026-10-02-star-and-important-tag.md`：項目可加星號並在列表置頂；標籤「重要」在各處顯示時排最前面。

**Architecture:** 純邏輯放 `src/core`（`model.ts` 的 `setStarred`、`orderTags`；`query.ts` 的排序；`merge.ts` 的內容比較），先寫測試。UI 只負責顯示和呼叫 `app.mutate`。

**Tech Stack:** TypeScript、Svelte 5（runes）、Vitest。

---

### Task 1: model — `starred` 欄位與 `setStarred`

**Files:**
- Modify: `src/core/model.ts`
- Test: `tests/core/model.test.ts`

- [ ] **Step 1: 寫失敗的測試**（在 `tests/core/model.test.ts` 的 import 加入 `setStarred`，檔尾加入）

```ts
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
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run tests/core/model.test.ts`
Expected: FAIL（`setStarred` 不存在，`starred` 型別錯誤）

- [ ] **Step 3: 實作**（`src/core/model.ts`）

在 `Entry` 的 `trashedAt` 之後加入：

```ts
  /** 有星號的項目在列表置頂。舊資料沒有這個欄位，視為 false。 */
  starred?: boolean;
```

在 `restoreEntry` 之後加入：

```ts
export function setStarred(data: VaultData, id: string, starred: boolean, now: Date): VaultData {
  return mapEntry(data, id, (e) => (!!e.starred === starred ? e : { ...e, starred, updatedAt: now.toISOString() }));
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run tests/core/model.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/model.ts tests/core/model.test.ts
git commit -m "feat(core): add starred flag to entries"
```

### Task 2: model — `orderTags` 與 `allTags` 讓「重要」排最前

**Files:**
- Modify: `src/core/model.ts`
- Test: `tests/core/model.test.ts`

- [ ] **Step 1: 寫失敗的測試**（import 加入 `IMPORTANT_TAG`、`orderTags`）

```ts
describe('orderTags', () => {
  it('moves the important tag to the front and keeps the rest in order', () => {
    expect(orderTags(['work', IMPORTANT_TAG, 'bank'])).toEqual([IMPORTANT_TAG, 'work', 'bank']);
  });

  it('leaves lists without the important tag unchanged', () => {
    expect(orderTags(['work', 'bank'])).toEqual(['work', 'bank']);
  });

  it('does not mutate the input', () => {
    const tags = ['work', IMPORTANT_TAG];
    orderTags(tags);
    expect(tags).toEqual(['work', IMPORTANT_TAG]);
  });
});
```

在既有的 `describe('allTags')` 內加入：

```ts
  it('puts the important tag first', () => {
    const data = vaultOf(makeEntry({ id: 'a', tags: ['bank', '重要', 'work'] }));
    expect(allTags(data)).toEqual(['重要', 'bank', 'work']);
  });
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run tests/core/model.test.ts`
Expected: FAIL（`orderTags` 不存在；`allTags` 回傳 `['bank', 'work', '重要']`）

- [ ] **Step 3: 實作**（`src/core/model.ts`）

在常數區加入：

```ts
/** 這個標籤在各處顯示時固定排最前面。 */
export const IMPORTANT_TAG = '重要';
```

在 `normalizeTags` 之後加入：

```ts
/** 把「重要」移到最前面，其餘維持原順序。只用於顯示，不改存入的資料。 */
export function orderTags(tags: readonly string[]): string[] {
  return tags.includes(IMPORTANT_TAG) ? [IMPORTANT_TAG, ...tags.filter((t) => t !== IMPORTANT_TAG)] : [...tags];
}
```

把 `allTags` 改為：

```ts
export function allTags(data: VaultData): string[] {
  const tags = new Set(activeEntries(data).flatMap((e) => e.tags));
  return orderTags([...tags].sort((a, b) => a.localeCompare(b, 'zh-Hant')));
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run tests/core/model.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/model.ts tests/core/model.test.ts
git commit -m "feat(core): always list the 重要 tag first"
```

### Task 3: query — 有星號的置頂

**Files:**
- Modify: `src/core/query.ts`
- Test: `tests/core/query.test.ts`

- [ ] **Step 1: 寫失敗的測試**（在 `describe('sortEntries')` 內加入）

```ts
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
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run tests/core/query.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**（把 `sortEntries` 改為）

```ts
/** 有星號的排前面；兩群內各自依 mode 排序。 */
export function sortEntries(entries: readonly Entry[], mode: SortMode): Entry[] {
  const byStar = (a: Entry, b: Entry) => Number(!!b.starred) - Number(!!a.starred);
  const byUpdated = (a: Entry, b: Entry) => b.updatedAt.localeCompare(a.updatedAt);
  const byTitle = (a: Entry, b: Entry) =>
    a.title.localeCompare(b.title, 'zh-Hant', { sensitivity: 'base' }) || byUpdated(a, b);
  const byMode = mode === 'updated' ? byUpdated : byTitle;
  return [...entries].sort((a, b) => byStar(a, b) || byMode(a, b));
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run tests/core/query.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/query.ts tests/core/query.test.ts
git commit -m "feat(core): pin starred entries to the top"
```

### Task 4: merge — 星號列入內容比較

**Files:**
- Modify: `src/core/merge.ts`
- Test: `tests/core/merge.test.ts`

- [ ] **Step 1: 寫失敗的測試**（在 `describe('mergeVaults')` 內加入）

```ts
  it('reports a conflict when the sides differ only in the star', () => {
    const local = vaultOf(edit(a, { starred: true }, T1), b);
    const remote = vaultOf(edit(a, {}, T2), b);
    expect(mergeVaults(base, local, remote).conflicts.map((c) => c.id)).toEqual(['a']);
  });

  it('treats a missing star and false as the same', () => {
    const local = vaultOf(edit(a, { starred: false }, T1), b);
    const remote = vaultOf(edit(a, {}, T2), b);
    expect(mergeVaults(base, local, remote).conflicts).toEqual([]);
  });
```

在 `describe('resolveConflicts')` 內加入：

```ts
  it('keeps the star on the local copy', () => {
    const starredLocal = edit(a, { password: 'local', starred: true }, T1);
    const result = mergeVaults(base, vaultOf(starredLocal, b), vaultOf(remoteA, b));
    const data = resolveConflicts(result, { a: 'both' }, NOW, () => 'copy');
    expect(data.entries.find((e) => e.id === 'copy')?.starred).toBe(true);
  });
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run tests/core/merge.test.ts`
Expected: FAIL（第一個測試沒有衝突）

- [ ] **Step 3: 實作**（`sameContent` 的陣列最後加入 `!!e.starred`）

```ts
      e.passwordHistory.map((h) => [h.password, h.changedAt]), e.trashedAt, !!e.starred,
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run tests/core/merge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/merge.ts tests/core/merge.test.ts
git commit -m "feat(core): compare stars when merging"
```

### Task 5: UI — 列表星號、詳細頁切換、標籤顯示順序、衝突欄位

**Files:**
- Modify: `src/ui/EntryList.svelte`、`src/ui/EntryDetail.svelte`、`src/ui/VaultScreen.svelte`、`src/ui/EntryForm.svelte`、`src/ui/ConflictDialog.svelte`

- [ ] **Step 1: `EntryList.svelte`** — 標題前顯示星號：

```svelte
          <span class="title">
            {#if entry.starred}<span class="star" aria-hidden="true">★</span><span class="sr">已加星號，</span>{/if}{entry.title}
          </span>
```

`<style>` 加入：

```css
  .star {
    color: var(--brass);
    margin-right: 0.3rem;
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
```

垃圾桶用的是 `TrashView`，沒有用 `EntryList`，也沒有呼叫 `sortEntries`（已確認），所以垃圾桶不會置頂，也不會顯示星號。

- [ ] **Step 2: `EntryDetail.svelte`** — props 加 `onstar: () => void`；import `orderTags`；header 改為：

```svelte
  <header>
    <div class="title-row">
      <h2>{entry.title}</h2>
      <button
        class="btn-quiet star"
        class:on={entry.starred}
        aria-pressed={!!entry.starred}
        aria-label={entry.starred ? '移除星號' : '加上星號'}
        onclick={onstar}>{entry.starred ? '★' : '☆'}</button
      >
    </div>
    {#if entry.tags.length}
      <ul class="tags">
        {#each orderTags(entry.tags) as tag (tag)}<li>{tag}</li>{/each}
      </ul>
    {/if}
  </header>
```

```css
  .title-row {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .star {
    font-size: 1.4rem;
    line-height: 1;
    padding: 0.2rem 0.4rem;
    color: var(--ink-soft);
  }

  .star.on {
    color: var(--brass);
  }
```

- [ ] **Step 3: `VaultScreen.svelte`** — import `setStarred`，加入：

```ts
  async function star(id: string, starred: boolean) {
    await app.mutate((d, now) => setStarred(d, id, starred, now));
  }
```

`<EntryDetail>` 加上 `onstar={() => star(selected.id, !selected.starred)}`。

- [ ] **Step 4: `EntryForm.svelte`** — import `orderTags`；加入 `const shownTags = $derived(orderTags(tags));`；`{#each tags as tag (tag)}` 改成 `{#each shownTags as tag (tag)}`；Backspace 改成刪除畫面上的最後一個：

```ts
    } else if (event.key === 'Backspace' && !tagInput && tags.length) {
      const last = shownTags[shownTags.length - 1];
      tags = tags.filter((t) => t !== last);
```

建議清單 `available` 來自 `allTags`，已經排好順序，不用改。

- [ ] **Step 5: `ConflictDialog.svelte`** — `Field` 型別加 `'starred'`，`FIELDS` 在 `tags` 後加 `['starred', '星號']`，`text()` 加：

```ts
    if (field === 'starred') return entry.starred ? '有' : '無';
```

- [ ] **Step 6: 驗證**

Run: `npm test` → 全部 PASS
Run: `npm run check` → 0 errors
Run: `npm run build` → 成功
用 `npm run dev` 開啟 `?demo` 模式手動確認：加星號後置頂、在兩種排序模式下都正確、標籤篩選後仍置頂、「重要」在篩選列／詳細頁／表單都排最前面。

- [ ] **Step 7: Commit**

```bash
git add src/ui
git commit -m "feat(ui): star entries and show 重要 tag first"
```

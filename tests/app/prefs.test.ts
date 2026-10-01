import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, loadPrefs, savePrefs } from '../../src/app/prefs';
import { DEFAULT_CHAR_OPTIONS } from '../../src/core/generator';

class MemoryStore {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

describe('prefs', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadPrefs(new MemoryStore())).toEqual(DEFAULT_PREFS);
  });

  it('round-trips saved preferences', () => {
    const store = new MemoryStore();
    const prefs = { ...DEFAULT_PREFS, sort: 'title' as const, generatorMode: 'words' as const };
    savePrefs(store, prefs);
    expect(loadPrefs(store)).toEqual(prefs);
  });

  it('falls back to defaults for corrupt or invalid data', () => {
    const store = new MemoryStore();
    store.setItem('pwvault.prefs', '{bad');
    expect(loadPrefs(store)).toEqual(DEFAULT_PREFS);
    store.setItem('pwvault.prefs', JSON.stringify({ sort: 'random', chars: { ...DEFAULT_CHAR_OPTIONS, length: 999 } }));
    expect(loadPrefs(store)).toEqual(DEFAULT_PREFS);
  });

  it('keeps valid fields when others are invalid', () => {
    const store = new MemoryStore();
    store.setItem('pwvault.prefs', JSON.stringify({ sort: 'title', generatorMode: 'nope' }));
    expect(loadPrefs(store)).toEqual({ ...DEFAULT_PREFS, sort: 'title' });
  });
});

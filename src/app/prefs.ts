import {
  DEFAULT_CHAR_OPTIONS,
  DEFAULT_WORD_OPTIONS,
  MAX_LENGTH,
  MAX_WORDS,
  MIN_LENGTH,
  MIN_WORDS,
  type CharOptions,
  type WordOptions,
} from '../core/generator';
import type { SortMode } from '../core/query';
import type { KeyValueStore } from '../storage/auth';

const KEY = 'pwvault.prefs';

/** 每台裝置自己的偏好設定（不含任何秘密）。 */
export interface Prefs {
  sort: SortMode;
  generatorMode: 'chars' | 'words';
  chars: CharOptions;
  words: WordOptions;
}

export const DEFAULT_PREFS: Prefs = {
  sort: 'updated',
  generatorMode: 'chars',
  chars: DEFAULT_CHAR_OPTIONS,
  words: DEFAULT_WORD_OPTIONS,
};

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isIntIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

function validChars(v: unknown): CharOptions | null {
  const o = v as Partial<CharOptions> | null;
  if (!o || o.mode !== 'chars' || !isIntIn(o.length, MIN_LENGTH, MAX_LENGTH)) return null;
  if (![o.lower, o.upper, o.digits, o.symbols, o.excludeAmbiguous].every(isBool)) return null;
  if (!(o.lower || o.upper || o.digits || o.symbols)) return null;
  return o as CharOptions;
}

function validWords(v: unknown): WordOptions | null {
  const o = v as Partial<WordOptions> | null;
  if (!o || o.mode !== 'words' || !isIntIn(o.wordCount, MIN_WORDS, MAX_WORDS)) return null;
  if (typeof o.separator !== 'string' || o.separator.length > 3) return null;
  if (!isBool(o.capitalize) || !isBool(o.addNumber)) return null;
  return o as WordOptions;
}

export function loadPrefs(store: KeyValueStore): Prefs {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(store.getItem(KEY) ?? '{}') ?? {};
  } catch {
    return DEFAULT_PREFS;
  }
  return {
    sort: raw.sort === 'updated' || raw.sort === 'title' ? raw.sort : DEFAULT_PREFS.sort,
    generatorMode:
      raw.generatorMode === 'chars' || raw.generatorMode === 'words' ? raw.generatorMode : DEFAULT_PREFS.generatorMode,
    chars: validChars(raw.chars) ?? DEFAULT_PREFS.chars,
    words: validWords(raw.words) ?? DEFAULT_PREFS.words,
  };
}

export function savePrefs(store: KeyValueStore, prefs: Prefs): void {
  store.setItem(KEY, JSON.stringify(prefs));
}

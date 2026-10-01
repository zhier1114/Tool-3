import { randomInt } from './random';
import { WORDS } from './wordlist';

export const LOWER = 'abcdefghijklmnopqrstuvwxyz';
export const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const DIGITS = '0123456789';
export const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?/~';
export const AMBIGUOUS = '0O1lI';

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 128;
export const MIN_WORDS = 3;
export const MAX_WORDS = 12;

export interface CharOptions {
  mode: 'chars';
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

export interface WordOptions {
  mode: 'words';
  wordCount: number;
  separator: string;
  capitalize: boolean;
  addNumber: boolean;
}

export type GeneratorOptions = CharOptions | WordOptions;

export const DEFAULT_CHAR_OPTIONS: CharOptions = {
  mode: 'chars',
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: false,
};

export const DEFAULT_WORD_OPTIONS: WordOptions = {
  mode: 'words',
  wordCount: 4,
  separator: '-',
  capitalize: true,
  addNumber: true,
};

function pick(chars: string): string {
  return chars[randomInt(chars.length)];
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function generatePassword(options: GeneratorOptions): string {
  return options.mode === 'chars' ? generateChars(options) : generateWords(options);
}

/** 每個勾選的字元類型至少出現一次，其餘從全部可用字元中抽，最後洗牌。 */
function generateChars(o: CharOptions): string {
  if (!Number.isInteger(o.length) || o.length < MIN_LENGTH || o.length > MAX_LENGTH) {
    throw new RangeError(`長度需介於 ${MIN_LENGTH}～${MAX_LENGTH}`);
  }
  const strip = (set: string) => (o.excludeAmbiguous ? [...set].filter((c) => !AMBIGUOUS.includes(c)).join('') : set);
  const sets = [o.lower && LOWER, o.upper && UPPER, o.digits && DIGITS, o.symbols && SYMBOLS]
    .filter((s): s is string => Boolean(s))
    .map(strip);
  if (sets.length === 0) throw new Error('至少要選擇一種字元類型');
  const all = sets.join('');
  const chars = sets.map(pick);
  while (chars.length < o.length) chars.push(pick(all));
  return shuffle(chars).join('');
}

function generateWords(o: WordOptions): string {
  if (!Number.isInteger(o.wordCount) || o.wordCount < MIN_WORDS || o.wordCount > MAX_WORDS) {
    throw new RangeError(`字數需介於 ${MIN_WORDS}～${MAX_WORDS}`);
  }
  const words = Array.from({ length: o.wordCount }, () => {
    const w = WORDS[randomInt(WORDS.length)];
    return o.capitalize ? w[0].toUpperCase() + w.slice(1) : w;
  });
  if (o.addNumber) words.push(String(randomInt(10)));
  return words.join(o.separator);
}

import { describe, expect, it } from 'vitest';
import {
  AMBIGUOUS,
  DEFAULT_CHAR_OPTIONS,
  DEFAULT_WORD_OPTIONS,
  DIGITS,
  LOWER,
  SYMBOLS,
  UPPER,
  generatePassword,
} from '../../src/core/generator';

const hasAny = (s: string, set: string) => [...s].some((c) => set.includes(c));

describe('character mode', () => {
  it('uses the default length and every character class', () => {
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword(DEFAULT_CHAR_OPTIONS);
      expect(pw).toHaveLength(20);
      expect(hasAny(pw, LOWER) && hasAny(pw, UPPER) && hasAny(pw, DIGITS) && hasAny(pw, SYMBOLS)).toBe(true);
    }
  });

  it('only uses the selected classes', () => {
    const pw = generatePassword({ ...DEFAULT_CHAR_OPTIONS, lower: false, upper: false, symbols: false, length: 32 });
    expect(pw).toMatch(/^[0-9]{32}$/);
  });

  it('excludes ambiguous characters when asked', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword({ ...DEFAULT_CHAR_OPTIONS, excludeAmbiguous: true });
      expect(hasAny(pw, AMBIGUOUS)).toBe(false);
    }
  });

  it('rejects invalid options', () => {
    expect(() => generatePassword({ ...DEFAULT_CHAR_OPTIONS, length: 3 })).toThrow(RangeError);
    expect(() => generatePassword({ ...DEFAULT_CHAR_OPTIONS, length: 129 })).toThrow(RangeError);
    expect(() =>
      generatePassword({ ...DEFAULT_CHAR_OPTIONS, lower: false, upper: false, digits: false, symbols: false }),
    ).toThrow();
  });
});

describe('word mode', () => {
  it('produces capitalized words joined by the separator, plus a digit', () => {
    expect(generatePassword(DEFAULT_WORD_OPTIONS)).toMatch(/^([A-Z][a-z]+-){4}[0-9]$/);
  });

  it('honours capitalize, separator and addNumber', () => {
    const pw = generatePassword({ ...DEFAULT_WORD_OPTIONS, capitalize: false, separator: ' ', addNumber: false, wordCount: 5 });
    expect(pw).toMatch(/^[a-z]+( [a-z]+){4}$/);
  });

  it('rejects an invalid word count', () => {
    expect(() => generatePassword({ ...DEFAULT_WORD_OPTIONS, wordCount: 2 })).toThrow(RangeError);
    expect(() => generatePassword({ ...DEFAULT_WORD_OPTIONS, wordCount: 13 })).toThrow(RangeError);
  });
});

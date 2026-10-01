import { describe, expect, it } from 'vitest';
import { WORDS } from '../../src/core/wordlist';

describe('WORDS', () => {
  it('contains the EFF large list minus hyphenated words', () => {
    expect(WORDS).toHaveLength(7772);
  });

  it('contains only unique lowercase words', () => {
    expect(WORDS.every((w) => /^[a-z]+$/.test(w))).toBe(true);
    expect(new Set(WORDS).size).toBe(WORDS.length);
  });
});

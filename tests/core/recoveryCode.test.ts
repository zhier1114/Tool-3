import { describe, expect, it } from 'vitest';
import {
  RECOVERY_WORD_COUNT,
  generateRecoveryCode,
  isValidRecoveryCode,
  normalizeRecoveryCode,
} from '../../src/core/recoveryCode';
import { WORDS } from '../../src/core/wordlist';

describe('generateRecoveryCode', () => {
  it('produces the expected number of words from the wordlist', () => {
    const words = generateRecoveryCode().split(' ');
    expect(words).toHaveLength(RECOVERY_WORD_COUNT);
    expect(words.every((w) => WORDS.includes(w))).toBe(true);
  });

  it('produces a different code each time', () => {
    expect(generateRecoveryCode()).not.toBe(generateRecoveryCode());
  });
});

describe('normalizeRecoveryCode', () => {
  it('lowercases and accepts any non-letter separator', () => {
    expect(normalizeRecoveryCode('  Abacus-ZOOM\tzoology,\u3000abdomen ')).toBe('abacus zoom zoology abdomen');
  });
});

describe('isValidRecoveryCode', () => {
  it('accepts a generated code in messy formatting', () => {
    const code = generateRecoveryCode();
    expect(isValidRecoveryCode(code.toUpperCase().replaceAll(' ', ' - '))).toBe(true);
  });

  it('rejects a code with an unknown word', () => {
    const words = generateRecoveryCode().split(' ');
    words[3] = 'notaword';
    expect(isValidRecoveryCode(words.join(' '))).toBe(false);
  });

  it('rejects a code with the wrong number of words', () => {
    const words = generateRecoveryCode().split(' ');
    expect(isValidRecoveryCode(words.slice(1).join(' '))).toBe(false);
    expect(isValidRecoveryCode('')).toBe(false);
  });
});

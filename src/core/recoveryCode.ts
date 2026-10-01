import { randomInt } from './random';
import { WORDS } from './wordlist';

/** 10 個字 × log2(7772) ≈ 129 bits。 */
export const RECOVERY_WORD_COUNT = 10;
const WORD_SET = new Set(WORDS);

export function generateRecoveryCode(): string {
  return Array.from({ length: RECOVERY_WORD_COUNT }, () => WORDS[randomInt(WORDS.length)]).join(' ');
}

/** 轉小寫，任何非 a-z 的字元都視為分隔符號。 */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
    .join(' ');
}

export function isValidRecoveryCode(input: string): boolean {
  const words = normalizeRecoveryCode(input).split(' ');
  return words.length === RECOVERY_WORD_COUNT && words.every((w) => WORD_SET.has(w));
}

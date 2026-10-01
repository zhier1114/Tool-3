export const MIN_PASSWORD_LENGTH = 12;
export const MIN_STRENGTH_BITS = 60;

export interface StrengthResult {
  bits: number;
  level: 0 | 1 | 2 | 3 | 4;
  acceptable: boolean;
  reason: string | null;
}

const KEYBOARD_ROWS = ['`1234567890-=', 'qwertyuiop[]\\', "asdfghjkl;'", 'zxcvbnm,./'];
const COMMON_WORDS = [
  'password', 'passw0rd', 'qwerty', '123456', 'admin', 'letmein', 'welcome',
  'iloveyou', 'abc123', 'monkey', 'dragon', '111111', 'sunshine', 'princess', 'football',
];
/** 重複、連續或鍵盤相鄰的字元只算 0.2 個字元的熵。 */
const PATTERN_WEIGHT = 0.2;
const COMMON_WORD_PENALTY = 0.8;

function charPool(chars: string[]): number {
  let pool = 0;
  if (chars.some((c) => /[a-z]/.test(c))) pool += 26;
  if (chars.some((c) => /[A-Z]/.test(c))) pool += 26;
  if (chars.some((c) => /[0-9]/.test(c))) pool += 10;
  if (chars.some((c) => /[ !-/:-@[-`{-~]/.test(c))) pool += 33;
  if (chars.some((c) => c.codePointAt(0)! > 0x7e)) pool += 2000;
  return pool;
}

function keyboardAdjacent(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return KEYBOARD_ROWS.some((row) => {
    const i = row.indexOf(x);
    const j = row.indexOf(y);
    return i >= 0 && j >= 0 && Math.abs(i - j) === 1;
  });
}

function isPatterned(prev: string, cur: string): boolean {
  if (prev === cur) return true;
  if (Math.abs(cur.codePointAt(0)! - prev.codePointAt(0)!) === 1) return true;
  return keyboardAdjacent(prev, cur);
}

function levelOf(bits: number): StrengthResult['level'] {
  if (bits < 40) return 0;
  if (bits < 60) return 1;
  if (bits < 80) return 2;
  if (bits < 100) return 3;
  return 4;
}

export function estimateStrength(password: string): StrengthResult {
  const chars = [...password];
  if (chars.length === 0) return { bits: 0, level: 0, acceptable: false, reason: '請輸入主密碼' };

  let effective = 0;
  chars.forEach((c, i) => {
    effective += i > 0 && isPatterned(chars[i - 1], c) ? PATTERN_WEIGHT : 1;
  });
  const lower = password.toLowerCase();
  for (const word of COMMON_WORDS) {
    if (lower.includes(word)) effective -= word.length * COMMON_WORD_PENALTY;
  }
  effective = Math.max(effective, 0);

  const bits = Math.round(effective * Math.log2(charPool(chars)));
  let reason: string | null = null;
  if (chars.length < MIN_PASSWORD_LENGTH) reason = `至少需要 ${MIN_PASSWORD_LENGTH} 個字元`;
  else if (bits < MIN_STRENGTH_BITS) reason = '密碼太容易被猜到，請加長或混用不同類型的字元';
  return { bits, level: levelOf(bits), acceptable: reason === null, reason };
}

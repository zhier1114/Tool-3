import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, MIN_STRENGTH_BITS, estimateStrength } from '../../src/core/strength';

describe('estimateStrength', () => {
  it.each([
    'Tr0ub4dor&3x',
    'correct-horse-battery',
    '月亮-檯燈-咖啡-跑步-藍色',
    'Orbit-Velvet-Canyon-Mosaic-7',
  ])('accepts %s', (pw) => {
    const r = estimateStrength(pw);
    expect(r.acceptable).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.bits).toBeGreaterThanOrEqual(MIN_STRENGTH_BITS);
  });

  it.each(['aaaaaaaaaaaa', 'abcdefghijkl', 'password1234', 'qwertyuiopas', '123456123456', '一一一一一一一一一一一一'])(
    'rejects patterned password %s',
    (pw) => {
      const r = estimateStrength(pw);
      expect(r.acceptable).toBe(false);
      expect(r.bits).toBeLessThan(MIN_STRENGTH_BITS);
      expect(r.reason).toMatch(/容易被猜到/);
    },
  );

  it('rejects short passwords with a length message', () => {
    const r = estimateStrength('Sh0rt!x');
    expect(r.acceptable).toBe(false);
    expect(r.reason).toBe(`至少需要 ${MIN_PASSWORD_LENGTH} 個字元`);
  });

  it('rejects an empty password', () => {
    expect(estimateStrength('')).toEqual({ bits: 0, level: 0, acceptable: false, reason: '請輸入主密碼' });
  });

  it('assigns higher levels to stronger passwords', () => {
    expect(estimateStrength('password1234').level).toBe(0);
    expect(estimateStrength('Orbit-Velvet-Canyon-Mosaic-7').level).toBe(4);
  });
});

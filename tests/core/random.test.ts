import { describe, expect, it } from 'vitest';
import { randomBytes, randomInt } from '../../src/core/random';

describe('randomBytes', () => {
  it('returns the requested length', () => {
    expect(randomBytes(16)).toHaveLength(16);
  });

  it('returns different values on each call', () => {
    expect(randomBytes(16)).not.toEqual(randomBytes(16));
  });
});

describe('randomInt', () => {
  it('stays within [0, max) and covers every value', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const n = randomInt(10);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(10);
      seen.add(n);
    }
    expect(seen.size).toBe(10);
  });

  it('returns 0 when max is 1', () => {
    expect(randomInt(1)).toBe(0);
  });

  it('rejects an invalid max', () => {
    expect(() => randomInt(0)).toThrow(RangeError);
    expect(() => randomInt(1.5)).toThrow(RangeError);
    expect(() => randomInt(2 ** 32 + 1)).toThrow(RangeError);
  });
});

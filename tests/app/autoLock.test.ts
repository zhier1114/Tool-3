import { describe, expect, it } from 'vitest';
import { AutoLock } from '../../src/app/autoLock';

function setup() {
  let now = 0;
  let locks = 0;
  const lock = new AutoLock(() => locks++, { idleMs: 300_000, backgroundMs: 60_000 }, () => now);
  return {
    lock,
    advance: (ms: number) => (now += ms),
    locks: () => locks,
  };
}

describe('AutoLock', () => {
  it('locks after the idle timeout', () => {
    const t = setup();
    t.lock.start();
    t.advance(299_999);
    t.lock.tick();
    expect(t.locks()).toBe(0);
    t.advance(1);
    t.lock.tick();
    expect(t.locks()).toBe(1);
  });

  it('activity resets the idle timer', () => {
    const t = setup();
    t.lock.start();
    t.advance(200_000);
    t.lock.activity();
    t.advance(200_000);
    t.lock.tick();
    expect(t.locks()).toBe(0);
  });

  it('locks when returning after more than the background limit', () => {
    const t = setup();
    t.lock.start();
    t.lock.hidden();
    t.advance(60_000);
    t.lock.visible();
    expect(t.locks()).toBe(1);
  });

  it('does not lock after a short trip to the background', () => {
    const t = setup();
    t.lock.start();
    t.lock.hidden();
    t.advance(59_999);
    t.lock.visible();
    expect(t.locks()).toBe(0);
  });

  it('fires only once and stays quiet after stop', () => {
    const t = setup();
    t.lock.start();
    t.advance(400_000);
    t.lock.tick();
    t.lock.tick();
    expect(t.locks()).toBe(1);
    t.lock.start();
    t.lock.stop();
    t.advance(400_000);
    t.lock.tick();
    expect(t.locks()).toBe(1);
  });
});

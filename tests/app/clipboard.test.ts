import { describe, expect, it } from 'vitest';
import { ClipboardGuard } from '../../src/app/clipboard';

function setup(canClear = true) {
  let now = 0;
  const writes: string[] = [];
  const guard = new ClipboardGuard(
    {
      write: async (text) => {
        writes.push(text);
      },
      canClear: () => canClear,
      now: () => now,
    },
    30_000,
  );
  return { guard, writes, advance: (ms: number) => (now += ms) };
}

describe('ClipboardGuard', () => {
  it('copies and counts down', async () => {
    const t = setup();
    await t.guard.copy('secret');
    expect(t.writes).toEqual(['secret']);
    expect(t.guard.remainingSeconds()).toBe(30);
    t.advance(10_500);
    expect(t.guard.remainingSeconds()).toBe(20);
  });

  it('clears the clipboard when the countdown ends in the foreground', async () => {
    const t = setup();
    await t.guard.copy('secret');
    t.advance(30_000);
    await t.guard.tick();
    expect(t.writes).toEqual(['secret', '']);
    expect(t.guard.remainingSeconds()).toBe(0);
  });

  it('gives up without clearing when the app is not in the foreground', async () => {
    const t = setup(false);
    await t.guard.copy('secret');
    t.advance(30_000);
    await t.guard.tick();
    expect(t.writes).toEqual(['secret']);
    expect(t.guard.remainingSeconds()).toBe(0);
  });

  it('restarts the countdown on a new copy', async () => {
    const t = setup();
    await t.guard.copy('a');
    t.advance(20_000);
    await t.guard.copy('b');
    t.advance(20_000);
    await t.guard.tick();
    expect(t.writes).toEqual(['a', 'b']);
  });

  it('ignores failures while clearing', async () => {
    let now = 0;
    const guard = new ClipboardGuard(
      {
        write: async (text) => {
          if (text === '') throw new Error('not allowed');
        },
        canClear: () => true,
        now: () => now,
      },
      30_000,
    );
    await guard.copy('x');
    now = 30_000;
    await expect(guard.tick()).resolves.toBeUndefined();
  });
});

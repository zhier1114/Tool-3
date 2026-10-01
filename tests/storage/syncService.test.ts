import { describe, expect, it } from 'vitest';
import type { Resolution } from '../../src/core/merge';
import { addEntry, updateEntry, type VaultData } from '../../src/core/model';
import { generateRecoveryCode } from '../../src/core/recoveryCode';
import { WrongSecretError } from '../../src/core/vaultFile';
import { FakeDrive } from '../../src/storage/fakeDrive';
import {
  VaultLockedError,
  createVault,
  locateVault,
  unlockVault,
  type ConflictResolver,
  type UnlockedVault,
} from '../../src/storage/syncService';
import { FAST_KDF, makeEntry } from '../helpers';

const PASSWORD = 'Correct-Horse-Battery-9';
const NEW_PASSWORD = 'New-Password-Is-Long-42';

/** 每次呼叫前進 1 秒，確保每次修改的 updatedAt 都不同。 */
function tickingClock() {
  let t = Date.UTC(2026, 9, 1);
  return () => new Date((t += 1000));
}

const noConflicts: ConflictResolver = async (conflicts) => {
  throw new Error(`預期不會有衝突，卻收到 ${conflicts.length} 個`);
};

const fields = { url: '', username: 'me', password: 'pw', notes: '', tags: [] };
const add = (title: string, id: string) => (d: VaultData, now: Date) => addEntry(d, { ...fields, title }, now, id).data;
const titles = (v: UnlockedVault) => v.data.entries.map((e) => e.title).sort();

async function openAs(drive: FakeDrive, clock: () => Date, secret = PASSWORD, type: 'password' | 'recovery' = 'password') {
  const locked = await locateVault(drive);
  if (!locked) throw new Error('找不到保險庫');
  return unlockVault(drive, locked, type, secret, clock);
}

async function setup() {
  const drive = new FakeDrive();
  const clock = tickingClock();
  const recovery = generateRecoveryCode();
  const a = await createVault(drive, PASSWORD, recovery, clock, FAST_KDF);
  const b = await openAs(drive, clock);
  return { drive, clock, recovery, a, b };
}

describe('create / locate / unlock', () => {
  it('returns null when there is no vault yet', async () => {
    expect(await locateVault(new FakeDrive())).toBeNull();
  });

  it('creates a vault that another device can unlock and read', async () => {
    const { drive, clock, a } = await setup();
    await a.apply(add('GitHub', 'gh'), noConflicts);
    expect(titles(await openAs(drive, clock))).toEqual(['GitHub']);
  });

  it('unlocks with the recovery code', async () => {
    const { drive, clock, recovery } = await setup();
    const v = await openAs(drive, clock, recovery, 'recovery');
    expect(v.data.entries).toEqual([]);
  });

  it('rejects a wrong password', async () => {
    const { drive, clock } = await setup();
    await expect(openAs(drive, clock, 'wrong-password')).rejects.toBeInstanceOf(WrongSecretError);
  });
});

describe('apply / sync', () => {
  it('does not upload when nothing changed', async () => {
    const { drive, a } = await setup();
    const uploads = () => drive.calls.filter((c) => c === 'update').length;
    const before = uploads();
    expect(await a.apply((d) => d, noConflicts)).toEqual({ pulled: false, pushed: false });
    expect(uploads()).toBe(before);
  });

  it('reports nothing to do when the remote did not change', async () => {
    const { a } = await setup();
    expect(await a.sync(noConflicts)).toEqual({ pulled: false, pushed: false });
  });

  it('merges edits to different entries made on two devices', async () => {
    const { drive, clock, a, b } = await setup();
    await a.apply(add('From A', 'a1'), noConflicts);
    expect(await b.apply(add('From B', 'b1'), noConflicts)).toEqual({ pulled: true, pushed: true });
    expect(titles(await openAs(drive, clock))).toEqual(['From A', 'From B']);
    expect(await a.sync(noConflicts)).toEqual({ pulled: true, pushed: false });
    expect(titles(a)).toEqual(['From A', 'From B']);
  });

  it('asks the resolver when both devices edited the same entry', async () => {
    const { drive, clock, a, b } = await setup();
    await a.apply(add('Shared', 's1'), noConflicts);
    await b.sync(noConflicts);
    await a.apply((d, now) => updateEntry(d, 's1', { password: 'from-a' }, now), noConflicts);

    const seen: { local?: string; remote?: string }[] = [];
    const resolver: ConflictResolver = async (conflicts) => {
      const answers: Record<string, Resolution> = {};
      for (const c of conflicts) {
        seen.push({ local: c.local?.password, remote: c.remote?.password });
        answers[c.id] = 'local';
      }
      return answers;
    };
    await b.apply((d, now) => updateEntry(d, 's1', { password: 'from-b' }, now), resolver);

    expect(seen).toEqual([{ local: 'from-b', remote: 'from-a' }]);
    const fresh = await openAs(drive, clock);
    expect(fresh.data.entries.find((e) => e.id === 's1')?.password).toBe('from-b');
  });

  it('keeps local changes after a failed save and pushes them on the next sync', async () => {
    const { drive, clock, a } = await setup();
    drive.failNext = new Error('offline');
    await expect(a.apply(add('Offline', 'o1'), noConflicts)).rejects.toThrow('offline');
    expect(titles(a)).toEqual(['Offline']);
    expect(await a.sync(noConflicts)).toEqual({ pulled: false, pushed: true });
    expect(titles(await openAs(drive, clock))).toEqual(['Offline']);
  });

  it('purges expired trash when saving', async () => {
    const { a } = await setup();
    await a.apply(
      (d) => ({ ...d, entries: [...d.entries, makeEntry({ id: 'old', trashedAt: '2020-01-01T00:00:00.000Z' })] }),
      noConflicts,
    );
    expect(a.data.entries).toEqual([]);
    expect(a.data.tombstones.map((t) => t.id)).toEqual(['old']);
  });
});

describe('changeSecret', () => {
  it('changes the master password', async () => {
    const { drive, clock, a } = await setup();
    await a.changeSecret('password', NEW_PASSWORD, noConflicts);
    await expect(openAs(drive, clock, PASSWORD)).rejects.toBeInstanceOf(WrongSecretError);
    expect((await openAs(drive, clock, NEW_PASSWORD)).data.entries).toEqual([]);
  });

  it('lets another device keep saving after the password changed', async () => {
    const { drive, clock, a, b } = await setup();
    await a.changeSecret('password', NEW_PASSWORD, noConflicts);
    await b.apply(add('After change', 'x1'), noConflicts);
    const fresh = await openAs(drive, clock, NEW_PASSWORD);
    expect(titles(fresh)).toEqual(['After change']);
  });

  it('replaces the recovery code', async () => {
    const { drive, clock, a, recovery } = await setup();
    const next = generateRecoveryCode();
    await a.changeSecret('recovery', next, noConflicts);
    await expect(openAs(drive, clock, recovery, 'recovery')).rejects.toBeInstanceOf(WrongSecretError);
    expect((await openAs(drive, clock, next, 'recovery')).data.entries).toEqual([]);
  });
});

describe('verifySecret', () => {
  it('confirms the current password and rejects others', async () => {
    const { a, recovery } = await setup();
    expect(await a.verifySecret('password', PASSWORD)).toBe(true);
    expect(await a.verifySecret('password', 'wrong-password')).toBe(false);
    expect(await a.verifySecret('recovery', recovery)).toBe(true);
  });

  it('checks against the latest password after a change', async () => {
    const { a } = await setup();
    await a.changeSecret('password', NEW_PASSWORD, noConflicts);
    expect(await a.verifySecret('password', PASSWORD)).toBe(false);
    expect(await a.verifySecret('password', NEW_PASSWORD)).toBe(true);
  });
});

describe('lock', () => {
  it('forgets the decrypted data', async () => {
    const { a } = await setup();
    a.lock();
    expect(a.locked).toBe(true);
    expect(() => a.data).toThrow(VaultLockedError);
    await expect(a.sync(noConflicts)).rejects.toBeInstanceOf(VaultLockedError);
  });
});

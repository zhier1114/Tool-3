import { describe, expect, it } from 'vitest';
import { DriveError, findVaultFiles } from '../../src/storage/drive';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fn, calls };
}

describe('findVaultFiles', () => {
  it('queries the app-tagged vault files with a bearer token', async () => {
    const file = { id: 'f1', name: 'vault.enc', version: '3', modifiedTime: '2026-10-01T00:00:00.000Z' };
    const { fn, calls } = fakeFetch(200, { files: [file] });
    expect(await findVaultFiles('tok', fn)).toEqual([file]);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/drive/v3/files');
    expect(url.searchParams.get('q')).toBe("appProperties has { key='pwvault' and value='1' } and trashed=false");
    expect(url.searchParams.get('fields')).toBe('files(id,name,version,modifiedTime)');
    expect(new Headers(calls[0].init?.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('returns an empty list when Drive omits files', async () => {
    expect(await findVaultFiles('tok', fakeFetch(200, {}).fn)).toEqual([]);
  });

  it('throws a DriveError carrying the HTTP status', async () => {
    const error = await findVaultFiles('tok', fakeFetch(401, { error: 'x' }).fn).catch((e) => e);
    expect(error).toBeInstanceOf(DriveError);
    expect(error.status).toBe(401);
  });
});

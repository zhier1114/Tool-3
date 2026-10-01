import { describe, expect, it } from 'vitest';
import { AuthExpiredError, DriveError, GoogleDriveClient } from '../../src/storage/driveClient';

interface Req {
  url: URL;
  method: string;
  headers: Headers;
  body: string;
}

function fakeFetch(route: (req: Req) => Response) {
  const requests: Req[] = [];
  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const req: Req = {
      url: new URL(String(input)),
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? init.body : '',
    };
    requests.push(req);
    return route(req);
  }) as typeof fetch;
  return { fn, requests };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const client = (fn: typeof fetch, token: string | null = 'tok') => new GoogleDriveClient(() => token, fn);

describe('GoogleDriveClient.findVault', () => {
  it('returns the most recently modified vault file', async () => {
    const { fn, requests } = fakeFetch(() => json({ files: [{ id: 'f1', version: '7' }, { id: 'f0', version: '2' }] }));
    expect(await client(fn).findVault()).toEqual({ id: 'f1', version: '7' });
    const { url, headers } = requests[0];
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/drive/v3/files');
    expect(url.searchParams.get('q')).toBe("appProperties has { key='pwvault' and value='1' } and trashed=false");
    expect(url.searchParams.get('orderBy')).toBe('modifiedTime desc');
    expect(url.searchParams.get('fields')).toBe('files(id,version)');
    expect(headers.get('Authorization')).toBe('Bearer tok');
  });

  it('returns null when there is no vault', async () => {
    expect(await client(fakeFetch(() => json({ files: [] })).fn).findVault()).toBeNull();
  });
});

describe('GoogleDriveClient errors', () => {
  it('throws AuthExpiredError without calling Drive when there is no token', async () => {
    const { fn, requests } = fakeFetch(() => json({}));
    await expect(client(fn, null).findVault()).rejects.toBeInstanceOf(AuthExpiredError);
    expect(requests).toHaveLength(0);
  });

  it('throws AuthExpiredError on HTTP 401', async () => {
    await expect(client(fakeFetch(() => json({}, 401)).fn).findVault()).rejects.toBeInstanceOf(AuthExpiredError);
  });

  it('throws DriveError carrying other HTTP statuses', async () => {
    const error = await client(fakeFetch(() => json({}, 500)).fn)
      .getVersion('f1')
      .catch((e) => e);
    expect(error).toBeInstanceOf(DriveError);
    expect(error).not.toBeInstanceOf(AuthExpiredError);
    expect(error.status).toBe(500);
  });
});

describe('GoogleDriveClient.getVersion / download', () => {
  it('reads the version field', async () => {
    const { fn, requests } = fakeFetch(() => json({ version: '12' }));
    expect(await client(fn).getVersion('f1')).toBe('12');
    expect(requests[0].url.pathname).toBe('/drive/v3/files/f1');
    expect(requests[0].url.searchParams.get('fields')).toBe('version');
  });

  it('downloads the content together with a stable version', async () => {
    const { fn, requests } = fakeFetch((req) =>
      req.url.searchParams.get('alt') === 'media' ? new Response('{"x":1}') : json({ version: '5' }),
    );
    expect(await client(fn).download('f1')).toEqual({ content: '{"x":1}', version: '5' });
    expect(requests.map((r) => r.url.searchParams.get('alt') ?? r.url.searchParams.get('fields'))).toEqual([
      'version',
      'media',
      'version',
    ]);
  });

  it('retries when the file changes during the download', async () => {
    const versions = ['1', '2', '2', '2'];
    let media = 0;
    const { fn } = fakeFetch((req) => {
      if (req.url.searchParams.get('alt') === 'media') return new Response(`content-${++media}`);
      return json({ version: versions.shift() });
    });
    expect(await client(fn).download('f1')).toEqual({ content: 'content-2', version: '2' });
  });
});

describe('GoogleDriveClient.create', () => {
  it('creates the PasswordVault folder when missing, then uploads the vault into it', async () => {
    const { fn, requests } = fakeFetch((req) => {
      if (req.method === 'GET') return json({ files: [] });
      if (req.url.pathname === '/drive/v3/files') return json({ id: 'folder-1' });
      return json({ id: 'f1', version: '1' });
    });
    expect(await client(fn).create('{"vault":true}')).toEqual({ id: 'f1', version: '1' });

    const [lookup, folder, upload] = requests;
    expect(lookup.url.searchParams.get('q')).toBe(
      "appProperties has { key='pwvault' and value='folder' } and trashed=false",
    );
    expect(folder.method).toBe('POST');
    expect(JSON.parse(folder.body)).toEqual({
      name: 'PasswordVault',
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { pwvault: 'folder' },
    });
    expect(upload.method).toBe('POST');
    expect(upload.url.origin + upload.url.pathname).toBe('https://www.googleapis.com/upload/drive/v3/files');
    expect(upload.url.searchParams.get('uploadType')).toBe('multipart');
    expect(upload.headers.get('Content-Type')).toMatch(/^multipart\/related; boundary=/);
    expect(upload.body).toContain(
      JSON.stringify({ name: 'vault.enc', parents: ['folder-1'], mimeType: 'application/json', appProperties: { pwvault: '1' } }),
    );
    expect(upload.body).toContain('{"vault":true}');
  });

  it('reuses an existing folder', async () => {
    const { fn, requests } = fakeFetch((req) =>
      req.method === 'GET' ? json({ files: [{ id: 'folder-9' }] }) : json({ id: 'f1', version: '1' }),
    );
    await client(fn).create('{}');
    expect(requests).toHaveLength(2);
    expect(requests[1].body).toContain('"parents":["folder-9"]');
  });
});

describe('GoogleDriveClient.update', () => {
  it('replaces the file content and returns the new version', async () => {
    const { fn, requests } = fakeFetch(() => json({ id: 'f1', version: '8' }));
    expect(await client(fn).update('f1', '{"new":1}')).toEqual({ id: 'f1', version: '8' });
    const req = requests[0];
    expect(req.method).toBe('PATCH');
    expect(req.url.origin + req.url.pathname).toBe('https://www.googleapis.com/upload/drive/v3/files/f1');
    expect(req.url.searchParams.get('uploadType')).toBe('media');
    expect(req.url.searchParams.get('fields')).toBe('id,version');
    expect(req.body).toBe('{"new":1}');
  });
});

import { describe, expect, it } from 'vitest';
import {
  AuthSession,
  EXPIRY_MARGIN_MS,
  buildAuthUrl,
  parseAuthCallback,
  type AuthEnv,
  type KeyValueStore,
} from '../../src/storage/auth';

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

class FakeEnv implements AuthEnv {
  store = new MemoryStore();
  time = 1_000_000;
  hash = '';
  navigated: string[] = [];
  clientId = 'client-id';
  redirectUri = 'https://example.com/app/';
  scope = 'scope-x';
  now = () => this.time;
  navigate = (url: string) => {
    this.navigated.push(url);
  };
  readHash = () => this.hash;
  clearHash = () => {
    this.hash = '';
  };
  randomState = () => 'state-123';
}

const TOKEN_HASH = '#access_token=tok&token_type=Bearer&expires_in=3600&state=state-123&scope=scope-x';

describe('buildAuthUrl', () => {
  it('builds an implicit-flow URL for Google', () => {
    const url = new URL(
      buildAuthUrl({ clientId: 'cid', redirectUri: 'https://e.com/', scope: 's', state: 'st', prompt: 'none' }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'cid',
      redirect_uri: 'https://e.com/',
      response_type: 'token',
      scope: 's',
      state: 'st',
      include_granted_scopes: 'true',
      prompt: 'none',
    });
  });

  it('omits prompt when not given', () => {
    const url = new URL(buildAuthUrl({ clientId: 'cid', redirectUri: 'https://e.com/', scope: 's', state: 'st' }));
    expect(url.searchParams.has('prompt')).toBe(false);
  });
});

describe('parseAuthCallback', () => {
  it('parses a token response', () => {
    expect(parseAuthCallback(TOKEN_HASH, 5000)).toEqual({
      kind: 'token',
      state: 'state-123',
      token: { value: 'tok', expiresAt: 5000 + 3600 * 1000 },
    });
  });

  it('parses an error response', () => {
    expect(parseAuthCallback('#error=access_denied&state=s', 0)).toEqual({ kind: 'error', state: 's', error: 'access_denied' });
  });

  it('returns null when the hash is not an OAuth response', () => {
    expect(parseAuthCallback('', 0)).toBeNull();
    expect(parseAuthCallback('#section', 0)).toBeNull();
  });

  it('rejects an invalid expires_in', () => {
    expect(parseAuthCallback('#access_token=t&expires_in=abc&state=s', 0)).toEqual({
      kind: 'error',
      state: 's',
      error: 'invalid_expires_in',
    });
  });
});

describe('AuthSession', () => {
  it('begin stores a state and navigates to Google', () => {
    const env = new FakeEnv();
    new AuthSession(env).begin('select_account');
    const url = new URL(env.navigated[0]);
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('prompt')).toBe('select_account');
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/app/');
  });

  it('complete returns none when there is no OAuth response', () => {
    expect(new AuthSession(new FakeEnv()).complete()).toEqual({ status: 'none' });
  });

  it('complete stores the token when the state matches', () => {
    const env = new FakeEnv();
    const auth = new AuthSession(env);
    auth.begin();
    env.hash = TOKEN_HASH;
    const token = { value: 'tok', expiresAt: env.time + 3600 * 1000 };
    expect(auth.complete()).toEqual({ status: 'ok', token });
    expect(env.hash).toBe('');
    expect(auth.current()).toEqual(token);
    expect(env.store.map.has('pwvault.oauth.state')).toBe(false);
  });

  it('complete rejects a mismatched state', () => {
    const env = new FakeEnv();
    const auth = new AuthSession(env);
    auth.begin();
    env.hash = TOKEN_HASH.replace('state-123', 'evil');
    expect(auth.complete()).toEqual({ status: 'error', error: 'state_mismatch' });
    expect(auth.current()).toBeNull();
  });

  it('complete rejects a response when no login was started', () => {
    const env = new FakeEnv();
    env.hash = TOKEN_HASH;
    expect(new AuthSession(env).complete()).toEqual({ status: 'error', error: 'state_mismatch' });
  });

  it('complete reports an OAuth error', () => {
    const env = new FakeEnv();
    const auth = new AuthSession(env);
    auth.begin();
    env.hash = '#error=access_denied&state=state-123';
    expect(auth.complete()).toEqual({ status: 'error', error: 'access_denied' });
  });

  it('current treats a token as expired within the safety margin', () => {
    const env = new FakeEnv();
    const auth = new AuthSession(env);
    auth.begin();
    env.hash = TOKEN_HASH;
    auth.complete();
    env.time += 3600 * 1000 - EXPIRY_MARGIN_MS - 1;
    expect(auth.current()).not.toBeNull();
    env.time += 1;
    expect(auth.current()).toBeNull();
  });

  it('current ignores corrupt stored data', () => {
    const env = new FakeEnv();
    env.store.setItem('pwvault.oauth.token', '{oops');
    expect(new AuthSession(env).current()).toBeNull();
  });

  it('logout forgets the token', () => {
    const env = new FakeEnv();
    const auth = new AuthSession(env);
    auth.begin();
    env.hash = TOKEN_HASH;
    auth.complete();
    auth.logout();
    expect(auth.current()).toBeNull();
  });
});

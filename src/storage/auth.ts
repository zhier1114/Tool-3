import { randomBytes } from '../core/random';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const STATE_KEY = 'pwvault.oauth.state';
const TOKEN_KEY = 'pwvault.oauth.token';
/** 權杖到期前 1 分鐘就視為過期，避免請求途中失效。 */
export const EXPIRY_MARGIN_MS = 60_000;

export interface AccessToken {
  value: string;
  /** epoch 毫秒 */
  expiresAt: number;
}

export type Prompt = 'none' | 'consent' | 'select_account';

export interface AuthUrlOptions {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  prompt?: Prompt;
}

export function buildAuthUrl(o: AuthUrlOptions): string {
  const params = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: 'token',
    scope: o.scope,
    state: o.state,
    include_granted_scopes: 'true',
  });
  if (o.prompt) params.set('prompt', o.prompt);
  return `${AUTH_ENDPOINT}?${params}`;
}

export type AuthCallback =
  | { kind: 'token'; state: string; token: AccessToken }
  | { kind: 'error'; state: string; error: string };

/** 解析 Google 導回時附在網址 # 之後的參數；不是 OAuth 回應就回傳 null。 */
export function parseAuthCallback(hash: string, now: number): AuthCallback | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const state = params.get('state') ?? '';
  const error = params.get('error');
  if (error) return { kind: 'error', state, error };
  const value = params.get('access_token');
  if (!value) return null;
  const expiresIn = Number(params.get('expires_in'));
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return { kind: 'error', state, error: 'invalid_expires_in' };
  return { kind: 'token', state, token: { value, expiresAt: now + expiresIn * 1000 } };
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AuthEnv {
  store: KeyValueStore;
  now(): number;
  navigate(url: string): void;
  readHash(): string;
  clearHash(): void;
  randomState(): string;
  clientId: string;
  redirectUri: string;
  scope: string;
}

export type CompleteResult =
  | { status: 'none' }
  | { status: 'ok'; token: AccessToken }
  | { status: 'error'; error: string };

export class AuthSession {
  constructor(private readonly env: AuthEnv) {}

  /** 產生一次性的 state（防 CSRF）後，整頁導向 Google 登入。 */
  begin(prompt?: Prompt): void {
    const state = this.env.randomState();
    this.env.store.setItem(STATE_KEY, state);
    this.env.navigate(
      buildAuthUrl({
        clientId: this.env.clientId,
        redirectUri: this.env.redirectUri,
        scope: this.env.scope,
        state,
        prompt,
      }),
    );
  }

  /** 頁面載入時呼叫：處理 Google 導回的結果，並把權杖從網址上清掉。 */
  complete(): CompleteResult {
    const callback = parseAuthCallback(this.env.readHash(), this.env.now());
    if (!callback) return { status: 'none' };
    this.env.clearHash();
    const expected = this.env.store.getItem(STATE_KEY);
    this.env.store.removeItem(STATE_KEY);
    if (!expected || callback.state !== expected) return { status: 'error', error: 'state_mismatch' };
    if (callback.kind === 'error') return { status: 'error', error: callback.error };
    this.env.store.setItem(TOKEN_KEY, JSON.stringify(callback.token));
    return { status: 'ok', token: callback.token };
  }

  current(): AccessToken | null {
    const raw = this.env.store.getItem(TOKEN_KEY);
    if (!raw) return null;
    try {
      const token = JSON.parse(raw) as AccessToken;
      if (typeof token.value !== 'string' || typeof token.expiresAt !== 'number') return null;
      return token.expiresAt - EXPIRY_MARGIN_MS > this.env.now() ? token : null;
    } catch {
      return null;
    }
  }

  logout(): void {
    this.env.store.removeItem(TOKEN_KEY);
    this.env.store.removeItem(STATE_KEY);
  }
}

export function browserAuthEnv(config: Pick<AuthEnv, 'clientId' | 'redirectUri' | 'scope'>): AuthEnv {
  return {
    ...config,
    store: sessionStorage,
    now: () => Date.now(),
    navigate: (url) => location.assign(url),
    readHash: () => location.hash,
    clearHash: () => history.replaceState(null, '', location.pathname + location.search),
    randomState: () => Array.from(randomBytes(16), (b) => b.toString(16).padStart(2, '0')).join(''),
  };
}

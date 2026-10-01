<script lang="ts">
  // 暫時的原型頁（網址加 ?prf-test）：驗證 Face ID／Touch ID 的 WebAuthn PRF 在這台裝置能否使用。
  // 不接觸保險庫，只測試能否穩定取得同一組 32 bytes 秘密值。正式功能完成後移除。
  import { fromBase64, toBase64 } from '../core/encoding';
  import { randomBytes } from '../core/random';

  const STORE_KEY = 'pwvault.prfTest';
  type Stored = { credentialId: string; salt: string };

  let log = $state<string[]>([]);
  let stored = $state<Stored | null>(load());
  let firstFingerprint = $state<string | null>(null);

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  function load(): Stored | null {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    } catch {
      return null;
    }
  }

  function write(line: string) {
    log = [...log, line];
  }

  async function fingerprint(bytes: ArrayBuffer): Promise<string> {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(hash.slice(0, 6), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function environment() {
    write(`執行模式：${standalone ? '主畫面 App' : '瀏覽器分頁'}`);
    write(`WebAuthn：${'PublicKeyCredential' in window ? '有' : '沒有'}`);
    try {
      const uv = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      write(`平台生物辨識：${uv ? '可用' : '不可用'}`);
    } catch (e) {
      write(`平台生物辨識：查詢失敗（${(e as Error).message}）`);
    }
    const caps = (PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> })
      .getClientCapabilities;
    if (caps) {
      const c = await caps.call(PublicKeyCredential);
      write(`回報支援 PRF：${c['extension:prf'] === true ? '是' : c['extension:prf'] === false ? '否' : '未回報'}`);
    } else {
      write('回報支援 PRF：瀏覽器不提供查詢');
    }
  }

  async function register() {
    try {
      const salt = randomBytes(32);
      const credential = (await navigator.credentials.create({
        publicKey: {
          rp: { name: '密碼庫', id: location.hostname },
          user: { id: randomBytes(16), name: 'pwvault-prf-test', displayName: '密碼庫（測試）' },
          challenge: randomBytes(32),
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            residentKey: 'preferred',
            userVerification: 'required',
          },
          timeout: 60_000,
          extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
        },
      })) as PublicKeyCredential | null;
      if (!credential) throw new Error('沒有建立通行金鑰');
      const prf = (credential.getClientExtensionResults() as { prf?: { enabled?: boolean } }).prf;
      write(`建立通行金鑰：成功；PRF enabled = ${String(prf?.enabled)}`);
      stored = { credentialId: toBase64(new Uint8Array(credential.rawId)), salt: toBase64(salt) };
      localStorage.setItem(STORE_KEY, JSON.stringify(stored));
    } catch (e) {
      write(`建立通行金鑰：失敗（${(e as Error).name}：${(e as Error).message}）`);
    }
  }

  async function evaluate() {
    if (!stored) return;
    try {
      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: randomBytes(32),
          rpId: location.hostname,
          allowCredentials: [{ type: 'public-key', id: fromBase64(stored.credentialId) }],
          userVerification: 'required',
          timeout: 60_000,
          extensions: { prf: { eval: { first: fromBase64(stored.salt) } } } as AuthenticationExtensionsClientInputs,
        },
      })) as PublicKeyCredential | null;
      if (!assertion) throw new Error('沒有取得驗證結果');
      const results = (assertion.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } }).prf
        ?.results;
      if (!results?.first) {
        write('驗證：成功，但沒有拿到 PRF 秘密值 ✗');
        return;
      }
      const fp = await fingerprint(results.first);
      const same = firstFingerprint === null ? '' : fp === firstFingerprint ? '，和上一次相同 ✓' : '，和上一次不同 ✗';
      firstFingerprint ??= fp;
      write(`驗證：成功，取得 ${results.first.byteLength} bytes 秘密值（指紋 ${fp}）${same}`);
    } catch (e) {
      write(`驗證：失敗（${(e as Error).name}：${(e as Error).message}）`);
    }
  }

  function reset() {
    localStorage.removeItem(STORE_KEY);
    stored = null;
    firstFingerprint = null;
    write('已清除測試資料（iPhone「設定 → 密碼」裡的測試通行金鑰可以手動刪除）');
  }

  void environment();
</script>

<main class="gate">
  <h1>Face ID／Touch ID 測試</h1>
  <p class="lead">這一頁只測試裝置是否支援，不會碰到你的保險庫。</p>
  <div class="row">
    <button class="btn-primary" onclick={register}>1. 建立測試用通行金鑰</button>
    <button class="btn-primary" disabled={!stored} onclick={evaluate}>2. 用 Face ID／Touch ID 驗證</button>
  </div>
  <p class="muted">第 2 步請按兩次，確認兩次結果「相同」。</p>
  <ol class="log">
    {#each log as line, i (i)}<li>{line}</li>{/each}
  </ol>
  <button onclick={reset}>清除測試資料</button>
</main>

<style>
  .log {
    padding: 1rem 1rem 1rem 2.25rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-m);
    display: grid;
    gap: 0.4rem;
    font-size: 0.95rem;
  }
</style>

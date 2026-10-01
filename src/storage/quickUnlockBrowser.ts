// QuickUnlock 的瀏覽器實作：localStorage、IndexedDB、WebAuthn PRF。無法在 Node 測試，以實機驗證。
import type { Bytes } from '../core/encoding';
import { randomBytes } from '../core/random';
import { QuickUnlock, type BiometricAuthenticator, type DeviceKeyStore } from './quickUnlock';

/** iPhone、iPad（iPadOS 會把自己回報成 Mac，所以另外用觸控點數判斷）。 */
export function isAppleMobile(): boolean {
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

const DB_NAME = 'pwvault';
const STORE = 'keys';
const DEVICE_KEY = 'device';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** CryptoKey 可直接存進 IndexedDB，而且保留「不可匯出」的屬性：JavaScript 只能拿來用，拿不到金鑰本體。 */
export const indexedDbKeyStore: DeviceKeyStore = {
  async load() {
    return ((await withStore('readonly', (s) => s.get(DEVICE_KEY))) as CryptoKey | undefined) ?? null;
  },
  async save(key) {
    await withStore('readwrite', (s) => s.put(key, DEVICE_KEY));
  },
  async clear() {
    await withStore('readwrite', (s) => s.delete(DEVICE_KEY));
  },
};

type PrfInputs = AuthenticationExtensionsClientInputs & { prf?: { eval?: { first: Bytes } } };
type PrfOutputs = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };

export const webAuthnAuthenticator: BiometricAuthenticator = {
  async isAvailable() {
    return (
      'PublicKeyCredential' in window && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  },

  async register() {
    const credential = (await navigator.credentials.create({
      publicKey: {
        rp: { name: '密碼庫', id: location.hostname },
        user: { id: randomBytes(16), name: 'pwvault', displayName: '密碼庫' },
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
        extensions: { prf: {} } as PrfInputs,
      },
    })) as PublicKeyCredential | null;
    if (!credential) throw new Error('沒有建立通行金鑰');
    return new Uint8Array(credential.rawId);
  },

  async evaluate(credentialId, salt) {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: credentialId }],
        userVerification: 'required',
        timeout: 60_000,
        extensions: { prf: { eval: { first: salt } } } as PrfInputs,
      },
    })) as PublicKeyCredential | null;
    const first = (assertion?.getClientExtensionResults() as PrfOutputs | undefined)?.prf?.results?.first;
    return first ? new Uint8Array(first) : null;
  },
};

export function browserQuickUnlock(): QuickUnlock {
  return new QuickUnlock({
    records: localStorage,
    keys: indexedDbKeyStore,
    authenticator: webAuthnAuthenticator,
    isAppleMobile,
  });
}

/** 底層為一般 ArrayBuffer 的位元組陣列（WebCrypto 接受的型別）。 */
export type Bytes = Uint8Array<ArrayBuffer>;

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function fromBase64(b64: string): Bytes {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function utf8Encode(text: string): Bytes {
  return new TextEncoder().encode(text) as Bytes;
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

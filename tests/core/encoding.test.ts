import { describe, expect, it } from 'vitest';
import { fromBase64, toBase64, utf8Decode, utf8Encode } from '../../src/core/encoding';

describe('base64', () => {
  it('encodes a known value', () => {
    expect(toBase64(utf8Encode('hi'))).toBe('aGk=');
  });

  it('round-trips every byte value', () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it('round-trips empty input', () => {
    expect(fromBase64(toBase64(new Uint8Array()))).toEqual(new Uint8Array());
  });
});

describe('utf8', () => {
  it('round-trips non-ASCII text', () => {
    expect(utf8Decode(utf8Encode('密碼🔑'))).toBe('密碼🔑');
  });

  it('rejects invalid UTF-8', () => {
    expect(() => utf8Decode(new Uint8Array([0xff]))).toThrow();
  });
});

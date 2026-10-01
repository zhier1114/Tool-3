import { describe, expect, it } from 'vitest';
import { safeUrl } from '../../src/app/url';

describe('safeUrl', () => {
  it('keeps http and https URLs', () => {
    expect(safeUrl('https://github.com/login')).toBe('https://github.com/login');
    expect(safeUrl('http://192.168.1.1')).toBe('http://192.168.1.1/');
  });

  it('adds https:// when the scheme is missing', () => {
    expect(safeUrl('  github.com ')).toBe('https://github.com/');
    expect(safeUrl('example.com:8443/x')).toBe('https://example.com:8443/x');
  });

  it('rejects other schemes and blanks', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,hi')).toBeNull();
    expect(safeUrl('')).toBeNull();
    expect(safeUrl('   ')).toBeNull();
  });

  it('rejects text that is not a URL', () => {
    expect(safeUrl('not a url')).toBeNull();
  });
});

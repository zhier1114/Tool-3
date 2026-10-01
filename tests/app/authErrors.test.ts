import { describe, expect, it } from 'vitest';
import { describeAuthError } from '../../src/app/authErrors';

describe('describeAuthError', () => {
  it('explains known OAuth errors', () => {
    expect(describeAuthError('access_denied')).toMatch(/取消.*測試使用者/);
    expect(describeAuthError('login_required')).toBe('需要重新登入 Google');
    expect(describeAuthError('interaction_required')).toBe('需要重新登入 Google');
    expect(describeAuthError('state_mismatch')).toBe('登入驗證失敗，請重新登入');
  });

  it('falls back to the raw code', () => {
    expect(describeAuthError('weird')).toBe('Google 登入失敗（weird）');
  });
});

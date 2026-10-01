const MESSAGES: Record<string, string> = {
  access_denied: '你取消了 Google 登入，或這個帳號不在測試使用者名單中',
  login_required: '需要重新登入 Google',
  interaction_required: '需要重新登入 Google',
  consent_required: '需要重新登入 Google',
  state_mismatch: '登入驗證失敗，請重新登入',
};

export function describeAuthError(code: string): string {
  return MESSAGES[code] ?? `Google 登入失敗（${code}）`;
}

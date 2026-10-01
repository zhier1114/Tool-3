/** 正規化使用者輸入的網址；只允許 http 與 https，避免 javascript: 之類的連結。 */
export function safeUrl(input: string): string | null {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  // 「host:port」不是協定，例如 example.com:8443。
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d+(?:[/?#]|$))/i.test(text);
  const withScheme = hasScheme ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

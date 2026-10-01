/** OAuth 用戶端 ID 不是秘密。安全性來自 Google Cloud 上設定的授權來源與測試使用者名單。 */
export const GOOGLE_CLIENT_ID = '1028578692002-6uhji7g1sb1p2ki0pi5bpvrjt3fl0a63.apps.googleusercontent.com';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** App 根目錄網址，必須與 Google Cloud 上的「已授權的重新導向 URI」完全一致。 */
export function redirectUri(): string {
  return new URL(import.meta.env.BASE_URL, location.origin).href;
}

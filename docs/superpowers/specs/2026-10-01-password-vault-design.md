# 密碼管理工具（Password Vault）設計規格

- 日期：2026-10-01
- 狀態：已確認，待撰寫實作計畫

## 1. 目標與非目標

### 目標
- 一個自己寫、自己掌控的密碼管理工具，可在 Windows（Edge/Chrome）與 iPhone/iPad（Safari「加入主畫面」）上使用。
- 密碼只以**加密檔**的形式存在使用者自己的 Google Drive，任何第三方（包含 Google）都只看得到密文。
- 任一裝置修改後，其他裝置開啟或切回 App 時能偵測到並自動更新；同時修改時能安全合併。

### 非目標（第一版不做）
- 離線使用（預設一律有網路）。
- Face ID / Windows Hello 解鎖（第二版，WebAuthn PRF）。
- CSV 匯入、KeePass（KDBX）匯出、自訂欄位（第二版）。
- 瀏覽器自動填入、TOTP 驗證碼（TOTP 刻意不做，避免兩個驗證因素放在同一檔案）。
- 多個保險庫、多人共用。

## 2. 整體架構

```
[iPhone/iPad Safari PWA] ─┐
                          ├─ 同一份靜態網頁 App（GitHub Pages）
[Windows Edge/Chrome]  ───┘        │
                                   │ OAuth 2.0（drive.file）
                                   ▼
                     Google Drive API ─► /PasswordVault/vault.enc（加密檔）
```

- **沒有後端伺服器**：加解密、合併、讀寫 Drive 全部在瀏覽器內完成。
- **技術棧**：TypeScript + Svelte + Vite；測試用 Vitest。Node.js 只用於開發與建置。
- **部署**：獨立的公開 GitHub repo，GitHub Actions 建置後發布到 GitHub Pages（`https://<帳號>.github.io/<repo>/`）。程式碼公開無妨，其中不含任何秘密。
- **供應鏈原則**：
  - 執行期相依套件盡量少：`svelte`、`hash-wasm`（Argon2id）。字詞表直接內嵌在原始碼中，不額外引入套件。
  - 所有程式與資源皆打包進 App，**不從 CDN 載入**，不含任何分析或追蹤程式碼。
  - 鎖定 `package-lock.json`，CI 用 `npm ci`。
  - GitHub 帳號已開 2FA。

## 3. 加密檔格式（vault.enc）

檔案為 UTF-8 JSON，外層標頭為明文，內容為密文：

```json
{
  "format": "pwvault",
  "formatVersion": 1,
  "kdf": { "alg": "argon2id", "memoryKiB": 65536, "iterations": 3, "parallelism": 1 },
  "keySlots": [
    { "type": "password", "salt": "<b64>", "iv": "<b64>", "wrappedKey": "<b64>" },
    { "type": "recovery", "salt": "<b64>", "iv": "<b64>", "wrappedKey": "<b64>" }
  ],
  "payload": { "iv": "<b64>", "ciphertext": "<b64>" }
}
```

### 金鑰結構（envelope encryption）
- **資料金鑰（DEK）**：建立保險庫時隨機產生 256-bit，用來以 AES-256-GCM 加密 payload。
- **包裝金鑰（KEK）**：分別由「主密碼」與「救援碼」各自加上 16-byte 隨機 salt，經 Argon2id 推導出 256-bit。KEK 以 AES-256-GCM 包裝 DEK，存成 `keySlots`。
- **修改主密碼**：只需重新產生 password slot，不必重新加密 payload。
- **重新產生救援碼**：只需重新產生 recovery slot。
- **每次存檔**：payload 使用新的隨機 96-bit IV。
- **AAD**：payload 加密時，以標頭（`format`、`formatVersion`、`kdf`、`keySlots`）的正規化 JSON 作為 AAD，防止標頭被竄改後仍能解密。
- **Argon2id 參數**：64 MiB 記憶體、3 次迭代、平行度 1，目標是在 iPhone 上約 1 秒內完成。參數存在檔案裡，日後可以調高。
- **救援碼**：從內嵌的 EFF 大字詞表（7776 字）隨機抽 10 個英文單字（約 129 bits 熵）。只在建立保險庫或重新產生時顯示一次，請使用者抄寫或印出。輸入時不分大小寫，空白與連字號皆可作為分隔。
- **不提供任何後門**：主密碼與救援碼都遺失時，資料無法復原。

### 主密碼強度規則
- 至少 12 字元。
- 自製強度估算（依字元集與長度估熵，並扣除重複、連續、鍵盤序列等模式），估計值低於 60 bits 時拒絕設定。
- 介面上提供強度條，並建議改用 4～5 個隨機詞組成的密碼句。

## 4. 明文資料模型（payload 解密後）

```ts
interface VaultData {
  schemaVersion: 1;
  entries: Entry[];
  tombstones: Tombstone[];   // 永久刪除的紀錄，供合併時判斷
}

interface Entry {
  id: string;                // UUID v4
  title: string;
  url: string;
  username: string;
  password: string;
  notes: string;
  tags: string[];
  createdAt: string;         // ISO 8601
  updatedAt: string;         // 任何欄位變動都更新；介面上顯示的「更新日期」
  passwordHistory: { password: string; changedAt: string }[]; // 最近 10 組，新的在前
  trashedAt: string | null;  // 非 null 表示在垃圾桶
}

interface Tombstone { id: string; deletedAt: string; }
```

- **密碼歷史**：修改密碼時，把舊密碼推入 `passwordHistory`，超過 10 組就丟掉最舊的。
- **垃圾桶**：刪除時設定 `trashedAt`（同時更新 `updatedAt`），可以還原。超過 30 天、或在垃圾桶內手動「永久刪除」時，移除該筆 Entry 並新增 Tombstone。
- **Tombstone**：保留 365 天後清除。
- **密碼產生器設定**：屬於各裝置的偏好，存在該裝置的 `localStorage`，不放進保險庫。

## 5. Google Drive 串接

- **權限範圍**：只用 `https://www.googleapis.com/auth/drive.file`，App 只能存取自己建立的檔案。
- **檔案位置**：雲端硬碟中看得到的資料夾 `PasswordVault/vault.enc`，使用者可以手動下載備份。檔案帶有 `appProperties: { pwvault: "1" }`，方便搜尋。
- **找檔**：第一次在某台裝置使用時，以 `appProperties has { key='pwvault' and value='1' } and trashed=false` 搜尋。找到就記下 `fileId`（存在 `localStorage`）；找不到就進入「建立新保險庫」流程。
- **版本**：使用 Drive 檔案的 `version` 欄位（單調遞增）作為版本號。
- **備份**：依賴 Drive 內建的修訂版本歷史（約 30 天或 100 個版本）。

### OAuth 登入
- 在 Google Cloud 建立「網頁應用程式」類型的 OAuth Client。同意畫面選外部，**維持「測試中」並只把自己加入測試使用者**（implicit flow 本來就沒有長效權杖，測試模式沒有壞處，且只有名單上的帳號能登入）。
- 授權來源：`https://<帳號>.github.io`、`http://localhost:5173`。
- **做法**：以整頁重新導向，走 OAuth 2.0 implicit flow（`response_type=token`）取得存取權杖，**不載入 Google 的外部 script**，以維持「不從 CDN 載入」的原則。權杖只放在記憶體與 `sessionStorage`。
- 權杖約 1 小時過期，過期後用 `prompt=none` 嘗試無聲重新導向；失敗才要求使用者點擊登入。
- 因為重新導向會清空頁面記憶體，**一律在解鎖前完成授權**。解鎖狀態下，進入編輯前若權杖剩餘時間少於 10 分鐘，就先鎖定、更新權杖，再請使用者解鎖。
- **風險已驗證（2026-10-01）**：Windows Chrome、iPhone Safari 分頁、iPhone「加入主畫面」三種情境下，整頁跳轉登入、Drive API 呼叫、`prompt=none` 無聲重新登入都正常，沿用此設計。

## 6. 同步、通知與衝突處理

### 本機狀態
- `base`：最後一次從雲端載入或成功上傳的內容與其 `version`。
- `local`：目前記憶體中的內容。

### 檢查時機
1. 開啟 App（解鎖後）：一律下載最新版。
2. App 從背景切回前景（`visibilitychange`），且仍在解鎖狀態時，查詢 `version`。若有變化就下載、合併，並顯示橫幅「雲端有更新，已重新載入」。
3. 每次存檔前都會檢查。
- 不做定時輪詢。

### 存檔流程
- 每完成一筆新增、修改或刪除，就立即存檔。
- **存檔時**：先查詢雲端 `version`。
  - 等於 `base.version`：加密並上傳，更新 `base`。
  - 不等於：下載雲端版本，做三方合併（base / local / remote），合併後上傳。
- Drive v3 不支援條件式寫入，因此「檢查到上傳」之間有極小的競爭空窗。單人使用下可以接受。

### 三方合併規則（以 Entry 的 id 為單位）
| base → local | base → remote | 結果 |
|---|---|---|
| 未變 | 未變 | 保留 |
| 有變 | 未變 | 採 local |
| 未變 | 有變 | 採 remote |
| 有變 | 有變，內容相同 | 採任一 |
| 有變 | 有變，內容不同 | **衝突**：顯示對照畫面，讓使用者選「用這台的」、「用雲端的」或「兩筆都留」（後者會以新 id 另存一份） |
| 一方 Tombstone | 另一方未變 | 刪除 |
| 一方 Tombstone | 另一方有變 | **衝突**：讓使用者選刪除或保留 |
| 僅一方新增 | — | 採新增的那一方 |

- 「有變」的判斷方式：`updatedAt` 與 base 不同。
- Tombstone 清單取兩方聯集。

## 7. 安全行為

- **解鎖**：每次開啟都要輸入主密碼，也可以選擇輸入救援碼。用救援碼解鎖後，強制設定新的主密碼。
- **自動鎖定**：閒置 5 分鐘，或切到背景超過 1 分鐘（回到前景時以時間戳判斷），就自動鎖定。鎖定時釋放 DEK 與明文資料的參照，並清空畫面。
  - 已知限制：JavaScript 無法保證記憶體被立即抹除。
- **密碼顯示**：預設遮成「●●●●」，點擊眼睛圖示才顯示。
- **剪貼簿**：按下複製後顯示 30 秒倒數。倒數結束時，若 App 仍在前景且有焦點，就清空剪貼簿。
  - 已知限制：App 在背景時無法清除。
- **CSP**（GitHub Pages 無法自訂 HTTP header，以 `<meta>` 設定）：`default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src https://www.googleapis.com; img-src 'self' data:; style-src 'self'; form-action 'none'; base-uri 'none'`。
  - 已知限制：`<meta>` 無法設定 `frame-ancestors`，改以程式偵測被嵌入 iframe 時拒絕執行。
- **不使用 Service Worker**：本工具一律連網使用，不需要；也避免快取舊版程式，導致更新延遲。PWA 只提供 manifest 與圖示，供「加入主畫面」使用。
- **不顯示網站圖示**：避免向第三方洩漏網站清單。

## 8. 功能與介面

- **語言**：繁體中文。
- **版面**：響應式，適用手機、平板與桌機；深淺色跟隨系統設定。

### 畫面
1. **Google 登入**：首次使用或權杖失效時。
2. **建立保險庫**（雲端上找不到檔案時）：設定主密碼（含強度條）→ 顯示救援碼，使用者勾選「我已抄寫」後才能繼續 → 建立檔案。
3. **解鎖**：主密碼輸入框，另有「改用救援碼」的連結。
4. **主清單**：
   - 搜尋框，即時搜尋標題、網站、帳號、標籤。
   - 標籤篩選列。
   - 依「最近更新」排序，可切換為「標題 A→Z」。
   - 每列顯示標題、帳號、更新日期，並有「複製帳號」、「複製密碼」快捷鍵。
5. **詳細／編輯**：
   - 包含全部欄位；網站欄位可點擊開啟網址。
   - 標籤輸入時，會以既有標籤作為建議。
   - 密碼欄旁有產生器按鈕。
   - 可展開密碼歷史，查看或複製舊密碼。
6. **密碼產生器**：
   - 字元模式：預設長度 20，包含大小寫、數字、符號，可勾選「排除易混淆字元 `0O1lI`」。
   - 詞組模式：預設 4 個字，加連字號與 1 個數字。
   - 使用 `crypto.getRandomValues`，並以拒絕取樣避免偏差。
   - 記住上次的設定。
7. **垃圾桶**：還原或永久刪除，並顯示剩餘天數。
8. **設定**：修改主密碼、重新產生救援碼、匯出明文 CSV（匯出前需重新輸入主密碼並顯示警告）、立即鎖定、登出 Google。
9. **衝突對照**：左右並排比較兩個版本的各欄位，並提供三個選項。

## 9. 專案結構

```
密碼管理工具/                   ← 獨立 git repo（上層「小工具」repo 忽略此資料夾）
├─ src/
│  ├─ core/                     ← 純邏輯、無 I/O，完整單元測試
│  │  ├─ crypto.ts              （Argon2id、AES-GCM、金鑰包裝）
│  │  ├─ vaultFile.ts           （加密檔格式的序列化與驗證）
│  │  ├─ model.ts               （Entry 操作：新增、修改、密碼歷史、垃圾桶）
│  │  ├─ merge.ts               （三方合併）
│  │  ├─ generator.ts           （密碼與詞組產生器）
│  │  ├─ recoveryCode.ts
│  │  ├─ strength.ts
│  │  └─ wordlist.ts            （EFF 大字詞表）
│  ├─ storage/
│  │  ├─ auth.ts                （OAuth 重新導向流程）
│  │  ├─ driveClient.ts         （Drive REST 呼叫）
│  │  ├─ fakeDrive.ts           （測試用的記憶體版 Drive）
│  │  └─ syncService.ts         （base/local/remote 狀態、存檔流程）
│  ├─ ui/                       ← Svelte 元件
│  └─ main.ts
├─ tests/
├─ docs/
└─ .github/workflows/deploy.yml
```

- `syncService` 依賴 `DriveClient` 介面；測試時注入 `fakeDrive`，可以模擬「另一台裝置先改了」等情境。

## 10. 測試策略

- **TDD + Vitest**，涵蓋 `core/` 全部模組與 `syncService`：
  - 加解密來回、錯誤密碼、竄改標頭或密文時應失敗、用救援碼解鎖、修改主密碼後舊密碼失效。
  - 合併表格中的每一列情境、Tombstone 處理、新增的 id 衝突。
  - 密碼歷史上限、垃圾桶 30 天清除、Tombstone 365 天清除。
  - 產生器的長度、字元集與排除規則；強度估算的邊界值。
  - 以 fakeDrive 模擬：版本相同直接上傳、版本不同觸發合併、合併產生衝突時的回呼。
- **手動驗證**：真實 Google Drive 串接、Windows Edge、iPhone/iPad「加入主畫面」。

## 11. 開發順序

0. **OAuth 原型**：在 iPhone「加入主畫面」模式下驗證重新導向登入（見第 5 節的風險）。
1. **核心函式庫**加測試：crypto、vaultFile、model、merge、generator、recoveryCode、strength。
2. **Drive 串接與解鎖流程**：auth、driveClient、syncService；建立保險庫、解鎖、救援碼。
   - 開始前，使用者需依引導文件完成 Google Cloud 設定。
3. **UI**：清單、搜尋、標籤、詳細與編輯、產生器、密碼歷史、垃圾桶、自動鎖定、剪貼簿、設定、衝突對照。
4. **部署**：manifest 與圖示、CSP、GitHub Actions、GitHub Pages、iPhone 與 iPad 實測。

## 12. 第二版候選
- Face ID / Windows Hello 解鎖（WebAuthn PRF，需 iOS 18 以上）。
- 從 Chrome/Edge CSV 匯入。
- 匯出 KeePass（KDBX）格式。
- 自訂欄位。

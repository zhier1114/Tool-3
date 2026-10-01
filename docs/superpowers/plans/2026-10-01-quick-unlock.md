# 密碼管理工具：快速解鎖（Face ID／Touch ID 與記住裝置）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作規格第 7.1 節。iPhone／iPad 用 WebAuthn PRF（Face ID 或 Touch ID）解鎖，其他裝置用「記住這台裝置」（存在 IndexedDB、不可匯出的裝置金鑰）。在新裝置第一次用主密碼解鎖後詢問一次，設定頁可隨時開關。

**前提（已驗證）：** iPhone Safari、iPad Safari、iPhone 主畫面 App 都能建立平台通行金鑰、取得 PRF 秘密值，且兩次取得的值相同（2026-10-01，`?prf-test` 原型頁）。

**Architecture:**
- `src/storage/quickUnlock.ts`：純邏輯類別 `QuickUnlock`。透過三個介面注入相依：`KeyValueStore`（存紀錄）、`DeviceKeyStore`（存裝置金鑰）、`BiometricAuthenticator`（WebAuthn PRF）。可以完整單元測試。
- `src/storage/quickUnlockBrowser.ts`：上述介面的瀏覽器實作（localStorage、IndexedDB、WebAuthn），以實機驗證。
- 包裝方式沿用 `crypto.ts` 的 `wrapDataKey`／`unwrapDataKey`。PRF 秘密值經 HKDF-SHA256（salt `pwvault-prf-v1`、info `dek-wrap`）推導出 AES-GCM 包裝金鑰。
- 解開的 DEK 一律是可匯出的，所以快速解鎖之後照樣能修改主密碼。
- `syncService.ts` 新增 `openWithKey`，以及 `UnlockedVault.wrapDek`。

**本機紀錄（localStorage `pwvault.quickUnlock`）：** `{ v: 1, kind, fileId, iv, wrapped, credentialId?, salt? }`。其中只有包裝後的 DEK，沒有任何能直接解密的東西。

---

### Task 1: syncService — openWithKey 與 wrapDek

- [ ] 在 `tests/storage/syncService.test.ts` 加入測試：
  - `wrapDek` 包裝後再 `unwrapDataKey`，得到的 DEK 可以透過 `openWithKey` 打開，並看到同樣的資料。
  - 用另一個保險庫的 DEK 呼叫 `openWithKey`，會丟出 `VaultFormatError`。
- [ ] 實作：

```ts
export async function openWithKey(
  drive: DriveClient,
  locked: LockedVault,
  dek: CryptoKey,
  clock: Clock = systemClock,
): Promise<UnlockedVault> {
  const data = await readPayload(locked.file, dek);
  return new UnlockedVault(drive, clock, locked.fileId, locked.version, locked.file, dek, data);
}

// UnlockedVault
  /** 以外部金鑰包裝 DEK，供快速解鎖存放。 */
  async wrapDek(kek: CryptoKey): Promise<Encrypted> {
    return wrapDataKey(this.key(), kek);
  }
```

- [ ] Commit：`feat(storage): open a vault with an already-unwrapped key`

### Task 2: QuickUnlock

- [ ] `tests/storage/quickUnlock.test.ts`：使用 MemoryStore、記憶體版 DeviceKeyStore、假的 authenticator（`evaluate` 回傳 SHA-256(credentialId ‖ salt)，可設定成「不支援 PRF」）。測試項目：
  1. `preferredKind`：Apple 行動裝置且有平台驗證器時是 `biometric`；Apple 行動裝置但沒有平台驗證器時是 `device`；其他裝置是 `device`。
  2. `device`：啟用後，`unlock` 回傳的 DEK 能解開原本加密的資料。
  3. `biometric`：同上，而且 `evaluate` 收到的是當初存下的 credential 與 salt。
  4. `status` 只對相同 `fileId` 回報已啟用。
  5. `disable` 清除紀錄與裝置金鑰。
  6. 紀錄被竄改時，`unlock` 丟出 `QuickUnlockFailedError`，並自動停用。
  7. 不支援 PRF 時，`enable('biometric')` 丟出 `PrfUnsupportedError`，而且不留下任何紀錄。
  8. 解開的 DEK 可以再匯出（之後才能修改主密碼）。
  9. `wasOffered`／`markOffered`。
- [ ] 實作 `src/storage/quickUnlock.ts`。
- [ ] Commit：`feat(storage): add quick unlock with PRF and device keys`

### Task 3: 瀏覽器實作

- [ ] `src/storage/quickUnlockBrowser.ts`：
  - `isAppleMobile()`：UA 含 iPhone、iPad 或 iPod；或者 `platform === 'MacIntel'` 且 `maxTouchPoints > 1`（iPadOS 會偽裝成 Mac）。
  - `idbKeyStore`：資料庫 `pwvault`、object store `keys`、key `device`。
  - `webAuthnAuthenticator`：`register()` 建立平台通行金鑰（`userVerification: 'required'`、`extensions: { prf: {} }`）；`evaluate()` 以 `allowCredentials` 和 `prf.eval.first` 取得秘密值。
- [ ] Commit：`feat(storage): add browser adapters for quick unlock`

### Task 4: controller 與 UI

- controller：
  - `screen.unlock` 加上 `quick` 欄位。
  - 新增 `unlockQuick()`、`quickOffer`、`acceptQuickOffer()`、`declineQuickOffer()`、`quickKind`、`enableQuick()`、`disableQuick()`。
  - 用主密碼解鎖後呼叫 `maybeOfferQuickUnlock()`。
  - `signOut()` 會一併停用快速解鎖。
  - 錯誤處理：`NotAllowedError`（使用者取消）→ 顯示「已取消驗證」；`QuickUnlockFailedError`／`VaultFormatError` → 停用快速解鎖，請使用者輸入主密碼。
  - `PrfUnsupportedError` → 改用 `device`，並告知原因。
- `Unlock.svelte`：已啟用時，主要按鈕是「用 Face ID 或 Touch ID 解鎖」或「解鎖」；主密碼表單收在「改用主密碼」底下。
- `QuickUnlockOffer.svelte`：詢問對話框。
- `Settings.svelte`：「快速解鎖」區塊，顯示目前狀態；啟用前要先輸入主密碼；可以停用。
- 移除 `PrfTest.svelte`、`main.ts` 的 `?prf-test` 分支，以及登入、解鎖畫面上的暫時連結。
- demo 模式注入記憶體版的 QuickUnlock（`device`）。
- [ ] check、test、build；demo 模式截圖驗證；commit、push、等待部署。

### Task 5: 實機驗收（使用者操作）
1. iPhone 主畫面 App：用主密碼解鎖 → 出現詢問 → 啟用 → 鎖定 → 按「用 Face ID 或 Touch ID 解鎖」。
2. iPad：同上（Touch ID）。
3. Windows：用主密碼解鎖 → 啟用「記住這台裝置」→ 鎖定 → 按「解鎖」。
4. 在其中一台修改主密碼 → 另一台的快速解鎖仍然可用。
5. 設定頁停用 → 鎖定後只能用主密碼解鎖。

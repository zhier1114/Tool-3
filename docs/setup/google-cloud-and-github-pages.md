# 設定引導：Google Cloud 與 GitHub Pages

這份文件列出只有你本人能做的設定步驟。全部做完後，把 **OAuth 用戶端 ID** 交給開發者（或 Claude）即可。

- GitHub 帳號：`zhier1114`
- Repo：`https://github.com/zhier1114/Tool-3`
- App 網址（部署後）：`https://zhier1114.github.io/Tool-3/`

---

## A. GitHub Pages（約 1 分鐘）

1. 打開 `https://github.com/zhier1114/Tool-3/settings/pages`。
2. 在 **Build and deployment → Source** 選 **GitHub Actions**。
3. 不用按其他按鈕。部署流程會在之後加入的 workflow 裡自動執行。

---

## B. Google Cloud（約 10～15 分鐘）

全程用你**存放密碼檔的那個 Google 帳號**登入。

### B1. 建立專案
1. 打開 `https://console.cloud.google.com/projectcreate`。
2. 專案名稱填 `password-vault`，按 **建立**。
3. 確認畫面左上角的專案選單已切換到 `password-vault`。

### B2. 啟用 Google Drive API
1. 打開 `https://console.cloud.google.com/apis/library/drive.googleapis.com`。
2. 按 **啟用**。

### B3. 設定 OAuth 同意畫面（Google Auth Platform）
1. 打開 `https://console.cloud.google.com/auth/overview`，按 **開始使用**。
2. **應用程式資訊**：
   - 應用程式名稱：`密碼管理工具`
   - 使用者支援電子郵件：選你自己的信箱
3. **目標對象**：選 **外部**。
4. **聯絡資訊**：填你自己的信箱。
5. 勾選同意政策，按 **建立**。

不要上傳 Logo。上傳 Logo 會觸發 Google 的品牌審核。

### B4. 加入測試使用者，並維持「測試中」狀態
1. 打開 `https://console.cloud.google.com/auth/audience`。
2. **發布狀態**維持 **測試中**，不要按「發布應用程式」。
3. 在 **測試使用者** 按 **新增使用者**，填入你自己的 Gmail，儲存。

> 跟規格文件的差異：規格原本寫「發布為正式版」。改用「測試中」是因為我們的登入方式本來就沒有長效權杖，「測試中」對我們沒有任何壞處，**而且只有你加進名單的帳號能登入**，更安全。
>
> **注意：** 登入時選的帳號必須**完全等於**名單上的帳號。不在名單上的帳號會看到「存取遭到封鎖：這個應用程式尚未完成 Google 驗證程序」，而且**沒有任何繼續按鈕**。遇到這個畫面時，請檢查名單是否已儲存，以及登入時選的帳號是否正確。

### B5. 設定權限範圍
1. 打開 `https://console.cloud.google.com/auth/scopes`。
2. 按 **新增或移除範圍**，在清單中找到並勾選：
   `https://www.googleapis.com/auth/drive.file`（「查看、編輯、建立及刪除您透過這個應用程式使用的 Google 雲端硬碟檔案」）。
   - 清單裡找不到的話，在下方「手動新增範圍」貼上這串網址。
3. 按 **更新**，再按 **儲存**。

只勾這一個就好。這個範圍只能存取本 App 自己建立的檔案，碰不到你雲端硬碟裡的其他東西。

### B6. 建立 OAuth 用戶端
1. 打開 `https://console.cloud.google.com/auth/clients`，按 **建立用戶端**。
2. **應用程式類型**：**網頁應用程式**。
3. **名稱**：`password-vault-web`。
4. **已授權的 JavaScript 來源**，新增兩筆：
   - `https://zhier1114.github.io`
   - `http://localhost:5173`
5. **已授權的重新導向 URI**，新增兩筆（結尾的 `/` 不能省略）：
   - `https://zhier1114.github.io/Tool-3/`
   - `http://localhost:5173/`
6. 按 **建立**。

### B7. 取得用戶端 ID
建立完成後會跳出視窗，顯示：
- **用戶端 ID**：格式像 `123456789012-xxxxxxxx.apps.googleusercontent.com` ← **把這個交出來**
- **用戶端密鑰**：**不需要，也不要給任何人**。純前端 App 用不到它。

用戶端 ID 不是秘密，它本來就會出現在網頁原始碼裡。安全性來自「只允許上面設定的網址使用」，以及測試使用者名單。

---

## 完成檢查表
- [ ] GitHub Pages 的 Source 設為 GitHub Actions
- [ ] Google Drive API 已啟用
- [ ] 同意畫面：外部、測試中、已加入自己為測試使用者
- [ ] 權限範圍只有 `drive.file`
- [ ] 網頁用戶端：2 個 JavaScript 來源、2 個重新導向 URI
- [ ] 已取得用戶端 ID

# MDD 料號管理系統 V3.2

## 權限功能
- 一般使用者：可查詢料號、查看查詢結果。
- 管理員登入後：可新增、刪除、Excel 匯入／匯出、下載匯入範本。
- 後端 API 會驗證管理員簽章 Cookie，不是只隱藏前端按鈕。
- 保留 LINE Messaging API Webhook 查詢功能。

## Render 設定
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`

在 Render Dashboard → 此服務 → Environment 設定：
- `ADMIN_USERNAME`: 自行設定管理員帳號
- `ADMIN_PASSWORD`: 自行設定強且唯一的管理員密碼
- `SESSION_SECRET`: 至少 32 個隨機字元的長字串
- `LINE_CHANNEL_ACCESS_TOKEN`: 現有 LINE Token
- `LINE_CHANNEL_SECRET`: 現有 LINE Secret

請勿將管理員密碼、LINE Token 或 Secret 寫入 GitHub 或傳到聊天。登入有效期為 8 小時。

LINE Webhook:
`https://你的Render網址.onrender.com/webhook`

## 資料保存提醒
目前使用 SQLite。若 Render 沒有 Persistent Disk，重新部署或重建服務時資料可能遺失；重要資料建議使用持久化磁碟或 PostgreSQL。

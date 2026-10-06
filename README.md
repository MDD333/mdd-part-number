# MDD 料號管理系統 V3

## 功能

- 料號新增 / 編輯 / 刪除
- 依機型、項目、料號、備註搜尋
- 手機版管理後台
- SQLite 資料庫
- LINE Messaging API Webhook
- LINE 關鍵字查詢
- HTTPS 部署準備
- `/health` 健康檢查

## 專案結構

```text
mdd-part-number-V3/
├─ backend/
│  ├─ package.json
│  ├─ server.js
│  └─ .env.example
├─ frontend/
│  └─ index.html
└─ README.md
```

## 本機測試

需要 Node.js 18+。

```bash
cd backend
npm install
```

複製 `.env.example` 為 `.env`，填入：

```text
PORT=3000
LINE_CHANNEL_ACCESS_TOKEN=你的Token
LINE_CHANNEL_SECRET=你的ChannelSecret
```

啟動：

```bash
npm start
```

瀏覽：

```text
http://localhost:3000
```

## LINE Webhook

正式部署後，把：

```text
https://你的網域/webhook
```

填入 LINE Developers → Messaging API → Webhook URL。

再按 Verify，成功後開啟 Use webhook。

## Render 部署

建議使用 Render Web Service。

Root Directory：

```text
backend
```

Build Command：

```text
npm install
```

Start Command：

```text
npm start
```

Environment Variables：

```text
LINE_CHANNEL_ACCESS_TOKEN=你的Token
LINE_CHANNEL_SECRET=你的ChannelSecret
```

注意：不要把 Token / Channel Secret 放進 GitHub。

## LINE 使用方式

直接傳：

```text
PN-001234
```

或：

```text
A01
```

或：

```text
主板
```

或：

```text
電源
```

輸入：

```text
幫助
```

可查看使用方式。

## 重要

V3 目前使用 SQLite，適合原型與小型單機部署。

若正式給公司多人同時使用，下一版建議改成 Supabase/PostgreSQL，並增加登入權限、Excel 匯入/匯出、操作紀錄與多人協作。

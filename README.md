# MDD 料號管理系統 V3.1

## 已包含
- 左側新增料號
- 上方查詢與查詢結果
- 機型下拉選單
- 項目下拉選單（依機型聯動）
- 關鍵字查詢
- 新增／刪除
- Excel XLSX/XLS 匯入
- Excel XLSX 匯出
- Excel 匯入範本
- LINE Webhook 查詢
- SQLite
- 手機響應式介面

## Render
Root Directory: backend
Build Command: npm install
Start Command: npm start

Environment Variables:
LINE_CHANNEL_ACCESS_TOKEN=你的 Token
LINE_CHANNEL_SECRET=你的 Secret

Webhook:
https://你的Render網址.onrender.com/webhook

注意：目前使用 SQLite。若 Render 沒有 Persistent Disk，重建服務時資料可能遺失；正式公司環境建議 PostgreSQL / Supabase。

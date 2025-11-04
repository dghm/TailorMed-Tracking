# Netlify 部署指南 - track 專案

## 📋 前置準備

✅ 已完成：
- 代碼已推送到 GitHub: `https://github.com/dustz3/track.git`
- `.gitignore` 已設置（忽略 `.env`、`node_modules`、`dist/`）

---

## 🚀 部署步驟

### 步驟 1：登入 Netlify 並連接 GitHub

1. **訪問 Netlify**
   - 前往 https://app.netlify.com
   - 使用 GitHub 帳號登入（如果還沒有帳號，先註冊）

2. **連接 GitHub Repository**
   - 點擊 "Add new site" → "Import an existing project"
   - 選擇 "GitHub" 並授權 Netlify 訪問您的 GitHub
   - 在 repository 列表中選擇 `dustz3/track`

---

### 步驟 2：配置構建設定

在 Netlify Dashboard 的 "Configure the site" 頁面，設置以下項目：

#### 基本設定

- **Branch to deploy**: `main`（預設）
- **Build command**: `node compile.js`
- **Publish directory**: `dist`

> 💡 **注意**：由於 `track` 專案現在是獨立的 repository，`compile.js` 在根目錄，編譯產出在 `dist/` 目錄。

#### Netlify Functions 設定

- **Functions directory**: `backend/netlify/functions`

---

### 步驟 3：設置環境變數（最重要！）

這是**關鍵步驟**，API TOKEN 必須在這裡設定：

1. **進入 Netlify Dashboard**
   - 點擊您的網站 → Site settings → Environment variables
   - 點擊 "Add variable"

2. **添加以下環境變數**（從本地 `backend/.env` 複製）：

| 變數名稱 | 值 | 說明 |
|---------|-----|------|
| `AIRTABLE_API_KEY` | 您的 Airtable API Key | 從本地 `backend/.env` 複製 |
| `AIRTABLE_BASE_ID` | 您的 Airtable Base ID | 從本地 `backend/.env` 複製 |
| `AIRTABLE_SHIPMENTS_TABLE` | `Tracking` | 表格名稱 |

3. **設置環境範圍**
   - 勾選 "All scopes"（Production, Deploy previews, Branch deploys）
   - 或至少勾選 "Production"

> ⚠️ **重要**：這些環境變數是**敏感資訊**，請勿提交到 Git。Netlify 會安全地存儲它們。

---

### 步驟 4：觸發部署

#### 方式 A：自動部署（推薦）
- 點擊 "Deploy site"
- Netlify 會開始構建和部署
- 也可以在 GitHub 上推送代碼後自動觸發部署

#### 方式 B：手動部署
- 在 Netlify Dashboard 點擊 "Trigger deploy" → "Deploy site"

---

### 步驟 5：等待構建完成

1. **查看構建日誌**
   - 在 "Deploys" 標籤頁點擊正在進行的部署
   - 查看構建日誌，確認：
     - ✅ Pug 模板編譯成功
     - ✅ Stylus 樣式編譯成功
     - ✅ JavaScript 文件複製成功
     - ✅ Netlify Functions 安裝依賴成功

2. **檢查 Function 日誌**
   - 在 "Functions" 標籤頁查看 `tracking` function
   - 確認沒有錯誤訊息
   - 確認環境變數已正確讀取（檢查日誌中的 "AIRTABLE_API_KEY: SET"）

---

### 步驟 6：測試部署結果

1. **訪問您的網站**
   - Netlify 會提供一個 URL，例如：`https://your-site-name.netlify.app`
   - 或使用自定義域名（如果已設定）

2. **測試頁面**
   - 訪問 `https://your-site.netlify.app/basic`
   - 訪問 `https://your-site.netlify.app/standard`
   - 輸入追蹤號碼測試查詢功能

3. **測試 API**
   - 訪問 `https://your-site.netlify.app/api/health`
   - 應該返回 `{"status":"ok",...}`

---

## 📁 專案結構說明

```
track/
├── compile.js                    # 編譯腳本（在根目錄執行）
├── frontend/                     # 前端源碼
│   ├── Templates/               # Pug 模板
│   ├── Styles/                 # Stylus 樣式
│   ├── Javascript/             # JavaScript 源碼
│   └── Assets/                 # 靜態資源
├── backend/                      # 後端源碼
│   ├── netlify/
│   │   └── functions/          # Netlify Functions
│   │       ├── tracking.js     # API Function
│   │       └── package.json    # Function 依賴
│   └── database/               # 資料庫連接
└── dist/                         # 編譯產出（由 compile.js 生成）
    ├── index.html
    ├── basic.html
    ├── standard.html
    ├── css/
    ├── js/
    └── images/
```

---

## 🔍 構建設定對照表

| 項目 | 設定值 |
|------|--------|
| **Build command** | `node compile.js` |
| **Publish directory** | `dist` |
| **Functions directory** | `backend/netlify/functions` |
| **Node version** | 18（Netlify 預設） |

---

## 🔍 故障排除

### 問題 1：構建失敗 - "Cannot find module 'pug'"

**原因**：根目錄沒有 `package.json` 和依賴

**解決方法**：
1. 在 `track` 根目錄創建 `package.json`：
```json
{
  "name": "tailormed-track",
  "version": "1.0.0",
  "scripts": {
    "build": "node compile.js"
  },
  "dependencies": {
    "pug": "^3.0.2",
    "stylus": "^0.59.0"
  }
}
```

2. 或者，在 Netlify 構建命令中添加安裝步驟：
```
npm install && node compile.js
```

---

### 問題 2：Function 無法連接 Airtable

**檢查環境變數**：
- 確認在 Netlify Dashboard 已設置所有環境變數
- 確認變數名稱拼寫正確（大小寫敏感）
- 確認變數值正確（沒有多餘空格）

**檢查 Function 日誌**：
- 在 Netlify Dashboard → Functions → tracking → Logs
- 查看是否有 "AIRTABLE_API_KEY: NOT SET" 的錯誤

**解決方法**：
- 重新設置環境變數
- 重新部署網站

---

### 問題 3：頁面無法訪問（404）

**檢查發布目錄**：
- 確認 `dist` 目錄存在
- 確認 `index.html`, `basic.html`, `standard.html` 已生成

**解決方法**：
- 檢查構建日誌，確認編譯成功
- 確認發布目錄設置為 `dist`

---

### 問題 4：API 返回 404

**檢查重定向規則**：
- 確認 `netlify.toml` 中的 `[[redirects]]` 規則正確
- 確認 Function 路徑正確：`backend/netlify/functions`

---

## 📝 檢查清單

部署前確認：

- [ ] 代碼已推送到 GitHub (`https://github.com/dustz3/track.git`)
- [ ] Netlify 已連接 GitHub repository
- [ ] 構建命令設置為 `node compile.js`
- [ ] 發布目錄設置為 `dist`
- [ ] Functions 目錄設置為 `backend/netlify/functions`
- [ ] 環境變數已設置（AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_SHIPMENTS_TABLE）
- [ ] 根目錄有 `package.json`（如果需要的話）

部署後確認：

- [ ] 構建成功（沒有錯誤）
- [ ] Function 部署成功
- [ ] 網站可以訪問
- [ ] `/basic` 和 `/standard` 頁面可以訪問
- [ ] API 查詢功能正常
- [ ] 環境變數正確讀取（檢查 Function 日誌）

---

## 🎯 快速參考

### 重要檔案位置

- **編譯腳本**: `/compile.js` (根目錄)
- **前端源碼**: `/frontend/`
- **後端源碼**: `/backend/`
- **Netlify Function**: `/backend/netlify/functions/tracking.js`
- **編譯產出**: `/dist/`

### 環境變數（從本地 `backend/.env` 複製）

```
AIRTABLE_API_KEY=your_api_key_here
AIRTABLE_BASE_ID=your_base_id_here
AIRTABLE_SHIPMENTS_TABLE=Tracking
```

---

## 🔒 安全提醒

1. **不要將 `.env` 檔案提交到 Git**
   - ✅ `.env` 已在 `.gitignore` 中
   - ✅ 環境變數只在 Netlify Dashboard 設置

2. **定期輪換 API Key**
   - 如果 API Key 洩露，立即在 Airtable 中重新生成
   - 更新 Netlify 環境變數

3. **使用環境變數而非硬編碼**
   - ✅ 所有敏感資訊都使用環境變數
   - ✅ 代碼中沒有硬編碼的 API Key

---

## 📞 需要幫助？

如果遇到問題，請檢查：

1. Netlify Dashboard 的構建日誌
2. Netlify Dashboard 的 Function 日誌
3. 瀏覽器開發者工具的 Console 和 Network 標籤

---

**祝部署順利！** 🎉


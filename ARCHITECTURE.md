# TailorMed Track 專案架構說明

## 📋 專案概述

TailorMed Track 是一個貨件追蹤系統，提供前端查詢介面和後端 API 服務，用於查詢和管理貨件追蹤資訊。

---

## 🏗️ 整體架構

### 架構圖

```
┌─────────────────────────────────────────────────────────┐
│                     用戶瀏覽器                            │
│  (https://tailormed-track-preparing.netlify.app)        │
└─────────────────┬───────────────────────────────────────┘
                  │
                  │ HTTP 請求
                  │ GET /standard, /basic, /api/tracking
                  ▼
┌─────────────────────────────────────────────────────────┐
│                  Netlify (部署平台)                      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │           前端 (Static Site)                      │  │
│  │  - HTML (從 Pug 編譯)                            │  │
│  │  - CSS (從 Stylus 編譯)                          │  │
│  │  - JavaScript                                    │  │
│  │  - 靜態資源 (圖片、圖標)                         │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │        Netlify Functions (後端 API)              │  │
│  │  - /api/tracking                                 │  │
│  │  - /api/health                                   │  │
│  │  - /.netlify/functions/tracking                 │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────┬───────────────────────────────────────┘
                  │
                  │ API 請求
                  │ Airtable API
                  ▼
┌─────────────────────────────────────────────────────────┐
│                   Airtable (資料庫)                     │
│  - Base ID: appznhirfyiLbdpJJ                           │
│  - Table: Tracking                                     │
│  - 包含貨件資料和時間軸資訊                            │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 專案結構

```
track/
├── frontend/                    # 前端源碼
│   ├── Templates/              # Pug 模板
│   │   ├── basic.pug           # 基本追蹤頁面（4 個節點）
│   │   ├── standard.pug        # 標準追蹤頁面（7 個節點 + 2 個事件）
│   │   ├── index.pug           # 首頁
│   │   ├── design_ui.pug       # 設計 UI 頁面
│   │   └── components/         # 組件部分模板
│   │       ├── lookupPanel.pug
│   │       ├── resultsPanel.pug
│   │       ├── timelineVisual.pug
│   │       └── timelineIconLegend.pug
│   ├── Styles/                 # Stylus 樣式
│   │   ├── main.styl           # 主樣式
│   │   ├── variables.styl       # 變數定義
│   │   └── components/         # 組件樣式
│   ├── Javascript/              # JavaScript 源碼
│   │   ├── app.js              # 主要應用邏輯
│   │   ├── config.js           # API 配置
│   │   └── interaction.js      # 互動邏輯
│   └── Assets/                 # 靜態資源
│       ├── logo.png
│       ├── icon-*.svg
│       └── shipmentTracking.webp
│
├── backend/                     # 後端源碼
│   ├── netlify/
│   │   └── functions/
│   │       ├── tracking.js     # Netlify Function (API 端點)
│   │       └── airtable.js      # Airtable 連接模組（複製）
│   ├── database/
│   │   └── airtable.js         # Airtable 連接和查詢邏輯
│   └── local-api-server.js     # 本地開發 API 服務器
│
├── compile.js                   # 編譯腳本（Pug → HTML, Stylus → CSS）
├── netlify.toml                 # Netlify 部署配置
└── package.json                 # 專案依賴
```

---

## 🔄 前後端關係

### 1. 前端 (Frontend)

**位置**: `frontend/`

**職責**:
- 提供用戶介面（查詢表單、結果顯示、時間軸視覺化）
- 處理用戶輸入（Job No. 和 Tracking No.）
- 發送 API 請求到後端
- 渲染和顯示查詢結果

**技術棧**:
- **模板引擎**: Pug → 編譯為 HTML
- **樣式**: Stylus → 編譯為 CSS
- **腳本**: JavaScript（原生，無框架）

**頁面類型**:
- **basic.pug**: 簡化版，只顯示 4 個節點（Order Created, Shipment Collected, In Transit, Shipment Delivered）
- **standard.pug**: 完整版，顯示 7 個節點 + 2 個事件（根據 Transport Type 動態調整）
- **design_ui.pug**: 設計 UI 頁面

**API 調用**:
```javascript
// 在 standard.pug 和 basic.pug 中
const apiBaseUrl = isLocalhost 
  ? 'http://localhost:3001/api'  // 本地開發
  : '/api';                       // 生產環境（Netlify）

const apiUrl = `${apiBaseUrl}/tracking?orderNo=${orderNo}&trackingNo=${trackingNo}`;
const response = await fetch(apiUrl);
```

---

### 2. 後端 (Backend)

**位置**: `backend/`

**職責**:
- 處理 API 請求
- 連接 Airtable 資料庫
- 查詢貨件資料
- 生成時間軸資料
- 返回結構化的 JSON 回應

**技術棧**:
- **運行環境**: Netlify Functions (Serverless)
- **資料庫**: Airtable
- **語言**: Node.js

**核心檔案**:

#### A. Netlify Function (`backend/netlify/functions/tracking.js`)
- **端點**: `/.netlify/functions/tracking`
- **重定向**: `/api/tracking` → `/.netlify/functions/tracking`
- **功能**:
  - 處理 HTTP 請求（GET/POST）
  - 載入環境變數
  - 調用 Airtable 查詢模組
  - 返回 JSON 回應

#### B. Airtable 連接模組 (`backend/database/airtable.js`)
- **功能**:
  - 初始化 Airtable 連接
  - 查詢貨件資料 (`findShipment`)
  - 生成時間軸資料 (`findTimeline`)
  - 處理複雜的時間軸邏輯（狀態判斷、事件顯示等）

**API 回應格式**:
```json
{
  "success": true,
  "data": {
    "orderNo": "TM111668",
    "trackingNo": "EU5CET6N",
    "origin": "TPE",
    "destination": "PVG",
    "transportType": "Domestic",
    "timeline": [
      {
        "step": 1,
        "title": "Order Created",
        "time": "2025-10-10 10:16",
        "status": "completed",
        "isEvent": false,
        "isOrderCompleted": false
      },
      // ... 更多時間軸項目
    ]
  }
}
```

---

## 🔀 資料流程

### 查詢流程

```
1. 用戶在瀏覽器輸入
   └─> Job No.: TM111668
   └─> Tracking No.: EU5CET6N
   
2. 前端發送 API 請求
   └─> GET /api/tracking?orderNo=TM111668&trackingNo=EU5CET6N
   
3. Netlify 重定向
   └─> /api/tracking → /.netlify/functions/tracking
   
4. Netlify Function 處理
   └─> tracking.js 接收請求
   └─> 載入環境變數（AIRTABLE_API_KEY, AIRTABLE_BASE_ID）
   └─> 調用 airtable.js 模組
   
5. Airtable 查詢
   └─> airtable.js 連接到 Airtable
   └─> 查詢 Tracking 表格
   └─> 找到對應的貨件記錄
   └─> 生成時間軸資料
   └─> 返回結構化資料
   
6. 返回回應
   └─> Function 返回 JSON
   └─> 前端接收資料
   
7. 前端渲染
   └─> 顯示貨件資訊
   └─> 渲染時間軸
   └─> 應用樣式（completed, processing, pending）
```

---

## 🛠️ 編譯和部署流程

### 本地開發

1. **編譯前端**:
   ```bash
   cd src/Projects/TailorMed/track
   node compile.js
   ```
   - Pug → HTML（輸出到 `dist/`）
   - Stylus → CSS（輸出到 `dist/css/`）
   - 複製 JavaScript 和 Assets

2. **啟動本地 API 服務器**:
   ```bash
   cd backend
   node local-api-server.js
   ```
   - 運行在 `http://localhost:3001`
   - 直接連接 Airtable（使用 `.env` 檔案）

3. **預覽前端**:
   ```bash
   cd dist
   python3 -m http.server 8000
   ```
   - 訪問 `http://localhost:8000/standard.html`

### 生產部署 (Netlify)

1. **Git 推送**:
   ```bash
   git push origin main
   ```

2. **Netlify 自動構建**:
   - 讀取 `netlify.toml` 配置
   - 執行 `node compile.js`（編譯前端）
   - 打包 Netlify Functions（`backend/netlify/functions/`）
   - 部署到 CDN

3. **Netlify 配置** (`netlify.toml`):
   ```toml
   [build]
     command = "node compile.js"
     publish = "dist"
     functions = "backend/netlify/functions"
   
   [functions]
     node_bundler = "esbuild"
   ```

4. **環境變數**（在 Netlify Dashboard 設定）:
   - `AIRTABLE_API_KEY`
   - `AIRTABLE_BASE_ID`
   - `AIRTABLE_SHIPMENTS_TABLE` = `Tracking`

---

## 🔗 關鍵連接點

### 1. 前端 → 後端 API

**請求路徑**:
- 開發環境: `http://localhost:3001/api/tracking`
- 生產環境: `/api/tracking` → Netlify 重定向 → `/.netlify/functions/tracking`

**請求方式**: GET（查詢參數在 URL 中）

### 2. 後端 → Airtable

**連接方式**:
- 使用 Airtable Node.js SDK
- 透過環境變數配置（API Key, Base ID, Table Name）

**查詢邏輯**:
- 根據 `Job No.` 和 `Tracking No.` 查詢
- 支援多種欄位名稱組合（`Job No.`, `Job No`, `Order No` 等）
- 生成時間軸資料（包含複雜的狀態邏輯）

### 3. 資料處理

**時間軸邏輯**:
- 根據 `Transport Type` 決定顯示的節點數
  - `Domestic`: 4 個節點，無事件
  - `Export/Import/Cross`: 7 個節點 + 2 個事件
- 狀態判斷：
  - `completed`: 有日期時間資料
  - `processing`: 上一個節點已完成，當前節點未完成
  - `pending`: 未發生或上一個節點未完成
  - `order-completed`: 所有節點完成 + Shipment Delivered 有資料

---

## 📦 依賴關係

### 前端依賴（根目錄 `package.json`）
```json
{
  "dependencies": {
    "pug": "^3.0.2",        // 模板編譯
    "stylus": "^0.59.0"     // 樣式編譯
  }
}
```

### 後端依賴（根目錄 `package.json`）
```json
{
  "dependencies": {
    "airtable": "^0.12.2",  // Airtable SDK
    "dotenv": "^16.3.1"     // 環境變數載入
  }
}
```

**注意**: 所有依賴都在根目錄的 `package.json` 中，Netlify 會自動安裝。

---

## 🌐 部署架構

### Netlify 部署

```
GitHub Repository
    │
    │ (自動部署)
    ▼
Netlify Platform
    │
    ├─> 前端 (Static Site)
    │   └─> dist/ 目錄內容
    │       ├─> *.html
    │       ├─> css/
    │       ├─> js/
    │       └─> images/
    │
    └─> 後端 (Serverless Functions)
        └─> backend/netlify/functions/tracking.js
            └─> 包含 airtable.js 模組
```

### 環境變數

**本地開發**:
- 從 `backend/.env` 檔案讀取
- 使用 `dotenv` 載入

**生產環境**:
- 在 Netlify Dashboard 設定
- Function 執行時自動可用
- 不需要 `.env` 檔案

---

## 🔄 數據流向

### 讀取流程（Read）

```
用戶輸入
  ↓
前端表單驗證
  ↓
fetch API 請求
  ↓
Netlify Function (tracking.js)
  ↓
Airtable 模組 (airtable.js)
  ↓
Airtable API
  ↓
查詢 Tracking 表格
  ↓
返回資料
  ↓
處理和格式化
  ↓
生成時間軸
  ↓
返回 JSON
  ↓
前端接收
  ↓
渲染 UI
  ↓
顯示結果
```

---

## 📝 關鍵檔案說明

### 前端檔案

| 檔案 | 說明 |
|------|------|
| `frontend/Templates/basic.pug` | 基本追蹤頁面（4 個節點） |
| `frontend/Templates/standard.pug` | 標準追蹤頁面（7 個節點 + 2 個事件） |
| `frontend/Templates/design_ui.pug` | 設計 UI 頁面 |
| `frontend/Javascript/app.js` | 主要應用邏輯 |
| `frontend/Javascript/config.js` | API 配置（自動檢測環境） |

### 後端檔案

| 檔案 | 說明 |
|------|------|
| `backend/netlify/functions/tracking.js` | Netlify Function（API 端點） |
| `backend/database/airtable.js` | Airtable 連接和查詢邏輯 |
| `backend/netlify/functions/airtable.js` | Airtable 模組（複製，用於 Netlify 部署） |
| `backend/local-api-server.js` | 本地開發 API 服務器 |

### 配置檔案

| 檔案 | 說明 |
|------|------|
| `netlify.toml` | Netlify 部署配置（構建命令、發布目錄、Functions 目錄、重定向規則） |
| `compile.js` | 前端編譯腳本 |
| `package.json` | 專案依賴 |

---

## 🎯 設計特點

### 1. 前後端分離
- 前端：純靜態 HTML/CSS/JS
- 後端：Serverless Functions（無狀態）

### 2. 編譯時處理
- Pug → HTML（模板編譯）
- Stylus → CSS（樣式編譯）
- 運行時不需要編譯工具

### 3. Serverless 架構
- 使用 Netlify Functions（按需執行）
- 自動擴展，無需管理服務器
- 成本效益高（按使用量計費）

### 4. 資料庫即服務
- 使用 Airtable（無需自建資料庫）
- 透過 API 訪問
- 易於管理和更新

---

## 🔐 安全考量

### 1. API Key 保護
- 環境變數存儲（不提交到 Git）
- Netlify Dashboard 安全存儲
- 本地開發使用 `.env`（已忽略）

### 2. CORS 設定
- Function 返回適當的 CORS 標頭
- 允許所有來源（`Access-Control-Allow-Origin: *`）

### 3. 輸入驗證
- 前端驗證必填欄位
- 後端驗證參數完整性
- 錯誤處理和適當的錯誤訊息

---

## 📊 性能優化

### 1. 靜態資源
- 前端靜態部署（CDN 加速）
- 圖片優化（WebP 格式）

### 2. Serverless 優勢
- 按需執行（不請求時不運行）
- 自動擴展（處理高併發）

### 3. 資料快取
- Airtable API 快取（Airtable 端）
- 前端可實施本地快取（未來可優化）

---

## 🚀 擴展性

### 當前架構優勢

1. **易於擴展前端頁面**
   - 添加新的 Pug 模板即可
   - 編譯後自動部署

2. **易於擴展 API 端點**
   - 在 `tracking.js` 中添加新的路由
   - 或創建新的 Function 檔案

3. **易於更換資料庫**
   - `airtable.js` 模組化設計
   - 可以替換為其他資料庫連接

### 未來可能的改進

1. **添加認證**
   - API Key 驗證
   - 用戶登入系統

2. **資料快取**
   - Redis 快取
   - 減少 Airtable API 調用

3. **監控和日誌**
   - 錯誤追蹤
   - 性能監控

---

## 📚 總結

**TailorMed Track 專案採用現代化的前後端分離架構**：

- **前端**: 靜態網站，使用 Pug/Stylus 編譯，部署到 Netlify CDN
- **後端**: Serverless Functions，連接 Airtable 資料庫
- **資料**: Airtable（雲端資料庫即服務）
- **部署**: Netlify（一站式平台，自動部署）

這種架構的優點：
- ✅ 簡單易維護
- ✅ 成本效益高（Serverless）
- ✅ 自動擴展
- ✅ 快速部署
- ✅ 無需管理服務器

---

**版本**: 1.0  
**最後更新**: 2025-11-04


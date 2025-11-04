# Netlify Function 結構說明

## 問題

Netlify Function 無法找到 `airtable.js` 模組，錯誤訊息：
```
Cannot find module '/var/task/database/airtable'
```

## Netlify Functions 部署結構

Netlify Functions 在部署時：
- Functions 目錄下的所有檔案和子目錄**應該**會被包含在部署包中
- `__dirname` 在 Netlify 環境中指向 `/var/task`
- 如果 Function 在 `backend/netlify/functions/tracking.js`，部署後會在 `/var/task/tracking.js`
- 子目錄 `database/airtable.js` 應該在 `/var/task/database/airtable.js`

## 當前結構

```
backend/netlify/functions/
├── tracking.js
└── database/
    └── airtable.js  ← 已複製到這裡
```

## 可能的原因

1. **Netlify 沒有正確打包子目錄**
   - 雖然檔案已提交到 Git，但 Netlify 可能沒有正確打包 `database` 子目錄

2. **路徑解析問題**
   - `__dirname` 可能不是我們期望的值
   - 需要查看實際的 `__dirname` 值（已在代碼中添加日誌）

## 解決方案

### 方案 1：將 airtable.js 直接放在 functions 目錄（推薦）

將 `airtable.js` 直接放在 `backend/netlify/functions/` 目錄，而不是子目錄：

```
backend/netlify/functions/
├── tracking.js
└── airtable.js  ← 直接放在這裡
```

### 方案 2：檢查 Netlify 部署日誌

在 Netlify Dashboard 的構建日誌中，檢查：
- Functions 目錄下有哪些檔案被包含
- 是否有 `database/airtable.js`

### 方案 3：使用絕對路徑

如果 Netlify 保留了完整路徑結構，可能需要使用不同的路徑。

## 下一步

等待 Netlify 重新部署後，查看 Function 日誌中的詳細錯誤訊息，特別是：
- `__dirname` 的實際值
- 嘗試的所有路徑
- 哪些路徑存在，哪些不存在


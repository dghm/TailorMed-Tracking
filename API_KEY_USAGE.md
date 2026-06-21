# API Key 使用指南

## 重要：重啟 Netlify Dev

更新 `.env` 文件後，**必須重啟 `netlify dev`** 才能載入新的環境變數。

```bash
# 停止當前的 netlify dev（按 Ctrl+C）
# 然後重新啟動
cd /Users/arieshsieh/Develop/Development/src/Projects/TailorMed/track
netlify dev
```

## 確認 .env 文件格式

確保 `.env` 文件位於專案根目錄，格式如下：

```
API_KEYS=key1,key2,key3
```

**注意**：
- 多個 API Key 用**逗號分隔**（不要有空格）
- 例如：`API_KEYS=abc123,def456,ghi789`

## 測試 API Key

### 方法 1: 使用測試腳本（推薦）

```bash
# 在專案根目錄執行
./test-api-key.sh YOUR_API_KEY
```

### 方法 2: 使用 curl 命令

#### 方式 A: HTTP Header（推薦）
```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "http://localhost:8888/api/tracking?orderNo=TM111700&trackingNo=VIWDWDV0"
```

#### 方式 B: Query Parameter（不建議）
```bash
curl "http://localhost:8888/api/tracking?orderNo=TM111700&trackingNo=VIWDWDV0&apiKey=YOUR_API_KEY"
```
> ⚠️ Query Parameter 會被記錄在伺服器/瀏覽器歷史紀錄中，僅供本機除錯使用，正式環境請改用 Header 或 POST Body。

#### 方式 C: POST Body
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"order":"TM111700","job":"VIWDWDV0","apiKey":"YOUR_API_KEY"}' \
  "http://localhost:8888/api/tracking"
```

### 方法 3: 在瀏覽器中測試

在瀏覽器地址欄輸入：
```
http://localhost:8888/api/tracking?orderNo=TM111700&trackingNo=VIWDWDV0&apiKey=YOUR_API_KEY
```

## 驗證 API Key 是否生效

### 檢查 Console 日誌

正式環境預設不會印出 API Key 相關除錯訊息（避免外洩）。若需要在本機除錯時查看狀態，可在 `.env` 設定 `DEBUG=true` 後重啟 `netlify dev`。

### 測試限制差異

1. **不帶 API Key**：快速查詢 4 次 → 第 4 次應觸發限制（3 次/分鐘）
2. **帶有效 API Key**：快速查詢 11 次 → 第 11 次應觸發限制（10 次/分鐘）

## 前端使用範例

如果要在前端 JavaScript 中使用 API Key：

```javascript
// 方式 1: 使用 Header
fetch('/api/tracking?orderNo=TM111700&trackingNo=VIWDWDV0', {
  headers: {
    'X-API-Key': 'YOUR_API_KEY'
  }
})
.then(response => response.json())
.then(data => console.log(data));

// 方式 2: 使用 Query Parameter（不建議，僅供本機除錯）
fetch('/api/tracking?orderNo=TM111700&trackingNo=VIWDWDV0&apiKey=YOUR_API_KEY')
.then(response => response.json())
.then(data => console.log(data));

// 方式 3: 使用 POST Body
fetch('/api/tracking', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    order: 'TM111700',
    job: 'VIWDWDV0',
    apiKey: 'YOUR_API_KEY'
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

## 常見問題

### Q: 更新 .env 後 API Key 無效？
**A**: 必須重啟 `netlify dev` 才能載入新的環境變數。

### Q: 如何確認 API Key 是否正確？
**A**: 在 `.env` 設定 `DEBUG=true` 後重啟 `netlify dev`，即可在終端看到驗證狀態的除錯訊息。

### Q: API Key 可以包含特殊字符嗎？
**A**: 可以，但建議使用字母、數字和連字符（-）或下劃線（_）

### Q: 多個 API Key 如何分隔？
**A**: 使用逗號（`,`）分隔，不要有空格，例如：`key1,key2,key3`


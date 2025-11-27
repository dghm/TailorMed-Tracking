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

#### 方式 B: Query Parameter
```bash
curl "http://localhost:8888/api/tracking?orderNo=TM111700&trackingNo=VIWDWDV0&apiKey=YOUR_API_KEY"
```

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

當使用 API Key 時，Netlify dev 終端會顯示：
```
🔑 API Key provided: abc12345...
🔑 API Key valid: true
```

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

// 方式 2: 使用 Query Parameter
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
**A**: 檢查 Netlify dev 終端的日誌，應該看到 `🔑 API Key valid: true`

### Q: API Key 可以包含特殊字符嗎？
**A**: 可以，但建議使用字母、數字和連字符（-）或下劃線（_）

### Q: 多個 API Key 如何分隔？
**A**: 使用逗號（`,`）分隔，不要有空格，例如：`key1,key2,key3`


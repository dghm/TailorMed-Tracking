# API Key 設定說明

## 功能說明

系統支持通過 API Key 為客戶提供更高的查詢限制：
- **普通用戶**：每分鐘 3 次，每小時 10 次
- **API Key 用戶**：每分鐘 10 次，每小時 50 次

## 設定 API Keys

### 1. 在 Netlify 環境變數中設定

在 Netlify Dashboard 中，進入您的網站設定：
1. 前往 **Site settings** > **Environment variables**
2. 新增環境變數：
   - **Key**: `API_KEYS`
   - **Value**: 多個 API Key 用逗號分隔，例如：`key1,key2,key3`

### 2. 在本地開發環境設定

在 `.env` 文件中添加：
```
API_KEYS=key1,key2,key3
```

## 使用 API Key

客戶可以通過以下三種方式傳遞 API Key：

### 方式 1: HTTP Header（推薦）
```bash
curl -H "X-API-Key: your-api-key" \
  "https://your-domain.com/api/tracking?orderNo=TM111700&trackingNo=VIWDWDV0"
```

### 方式 2: Query Parameter
```bash
curl "https://your-domain.com/api/tracking?orderNo=TM111700&trackingNo=VIWDWDV0&apiKey=your-api-key"
```

### 方式 3: POST Body（僅 POST 請求）
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"order":"TM111700","job":"VIWDWDV0","apiKey":"your-api-key"}' \
  "https://your-domain.com/api/tracking"
```

## 限制說明

### 普通用戶（無 API Key）
- 每分鐘最多 3 次查詢
- 每小時最多 10 次查詢

### API Key 用戶
- 每分鐘最多 10 次查詢
- 每小時最多 50 次查詢

## 錯誤訊息

當超過限制時，會返回 429 錯誤：
```json
{
  "success": false,
  "error": "rate_limit",
  "errorType": "rate_limit",
  "message": "Rate limit exceeded. Maximum 50 queries per hour. Please try again in X minute(s).",
  "limitType": "hour",
  "limit": 50,
  "waitTime": 30
}
```

## 安全建議

1. **保護 API Key**：不要將 API Key 提交到公開的 Git 倉庫
2. **定期更換**：建議定期更換 API Key
3. **限制分發**：只將 API Key 提供給信任的客戶
4. **監控使用**：定期檢查 API 使用情況，發現異常及時處理


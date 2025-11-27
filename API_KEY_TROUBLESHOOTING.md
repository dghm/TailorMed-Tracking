# API Key 故障排除指南

## 問題：API Key 無法正常工作

### 檢查步驟

#### 1. 確認 .env 文件位置

根據 `netlify.toml` 的註釋，`.env` 文件應該放在 `backend/` 目錄下：

```
backend/.env
```

**不是**：
- ❌ `track/.env`（專案根目錄）
- ❌ `track/backend/netlify/functions/.env`

#### 2. 確認 .env 文件格式

`.env` 文件內容應該是：

```
API_KEYS=93585598,dghm
```

**注意**：
- 不要有空格
- 多個 API Key 用逗號分隔
- 不要用引號包圍

#### 3. 重啟 netlify dev

更新 `.env` 文件後，**必須重啟 `netlify dev`**：

```bash
# 停止當前的 netlify dev（按 Ctrl+C）
# 然後重新啟動
cd /Users/arieshsieh/Develop/Development/src/Projects/TailorMed/track
netlify dev
```

#### 4. 檢查環境變數是否載入

在 `netlify dev` 終端中，當您使用 API Key 查詢時，應該會看到：

```
🔍 API_KEYS env: SET
🔍 API_KEYS value: 93585598,dghm
🔑 API Key provided: 93585598
🔑 API Key valid: true
```

如果看到 `API_KEYS env: NOT SET`，說明環境變數沒有正確載入。

#### 5. 檢查 Rate Limit 狀態

如果已經超過限制，會看到：

```
⚠️ Rate limit exceeded for IP: ::1
```

**解決方法**：
- 等待限制時間過期
- 或者清除 rate limit 緩存（重啟 netlify dev）

#### 6. 測試 API Key

使用以下命令測試：

```bash
# 測試 API Key 93585598
curl -H "X-API-Key: 93585598" \
  "http://localhost:8888/api/tracking?orderNo=TM111700&trackingNo=VIWDWDV0"

# 測試 API Key dghm
curl -H "X-API-Key: dghm" \
  "http://localhost:8888/api/tracking?orderNo=TM111700&trackingNo=VIWDWDV0"
```

如果 API Key 有效，應該返回查詢結果，而不是 rate limit 錯誤。

### 常見問題

#### Q: 為什麼還是顯示 "Maximum 10 queries per hour"？

**A**: 這表示 API Key 沒有被正確識別。可能的原因：
1. `.env` 文件位置不對
2. 環境變數沒有正確載入（需要重啟 netlify dev）
3. API Key 格式不對

#### Q: 如何確認 API Key 是否被傳遞？

**A**: 檢查 `netlify dev` 終端的日誌：
- 應該看到 `🔑 API Key provided: ...`
- 應該看到 `🔑 API Key valid: true`

#### Q: 如何清除 Rate Limit？

**A**: 重啟 `netlify dev` 會清除記憶體中的 rate limit 緩存。

### 快速修復步驟

1. **確認 .env 文件位置**：`backend/.env`
2. **確認文件內容**：`API_KEYS=93585598,dghm`
3. **重啟 netlify dev**：停止並重新啟動
4. **測試**：使用 curl 或瀏覽器測試
5. **檢查日誌**：查看 netlify dev 終端的輸出


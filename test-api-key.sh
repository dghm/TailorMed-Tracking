#!/bin/bash

# API Key 測試腳本
# 使用方式：./test-api-key.sh YOUR_API_KEY

API_KEY=${1:-"your-api-key-here"}
BASE_URL="http://localhost:8888"
ORDER_NO="TM111700"
TRACKING_NO="VIWDWDV0"

echo "🔑 測試 API Key: ${API_KEY:0:8}..."
echo ""

# 測試 1: 使用 HTTP Header
echo "📋 測試 1: 使用 HTTP Header (X-API-Key)"
curl -s -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/tracking?orderNo=$ORDER_NO&trackingNo=$TRACKING_NO" \
  | jq '.' || echo "❌ 請求失敗"
echo ""
echo "---"
echo ""

# 測試 2: 使用 Query Parameter
echo "📋 測試 2: 使用 Query Parameter (apiKey)"
curl -s \
  "$BASE_URL/api/tracking?orderNo=$ORDER_NO&trackingNo=$TRACKING_NO&apiKey=$API_KEY" \
  | jq '.' || echo "❌ 請求失敗"
echo ""
echo "---"
echo ""

# 測試 3: 使用 POST Body
echo "📋 測試 3: 使用 POST Body"
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "{\"order\":\"$ORDER_NO\",\"job\":\"$TRACKING_NO\",\"apiKey\":\"$API_KEY\"}" \
  "$BASE_URL/api/tracking" \
  | jq '.' || echo "❌ 請求失敗"
echo ""
echo "---"
echo ""

# 測試 4: 不帶 API Key（對比）
echo "📋 測試 4: 不帶 API Key（普通用戶限制）"
curl -s \
  "$BASE_URL/api/tracking?orderNo=$ORDER_NO&trackingNo=$TRACKING_NO" \
  | jq '.' || echo "❌ 請求失敗"
echo ""


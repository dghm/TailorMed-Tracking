// API Key 驗證模組
// 從環境變數讀取有效的 API Keys

/**
 * 驗證 API Key 是否有效
 * @param {string} apiKey - 要驗證的 API Key
 * @returns {boolean} - 是否有效
 */
function validateApiKey(apiKey) {
  if (!apiKey) {
    return false;
  }

  // 從環境變數讀取有效的 API Keys（逗號分隔）
  const validApiKeys = process.env.API_KEYS
    ? process.env.API_KEYS.split(',').map((key) => key.trim())
    : [];

  // 檢查 API Key 是否存在於有效列表中
  return validApiKeys.includes(apiKey);
}

/**
 * 從請求中提取 API Key
 * @param {object} event - Netlify Function 事件對象
 * @returns {string|null} - API Key 或 null
 */
function extractApiKey(event) {
  // 優先從 header 讀取
  const headerKey =
    event.headers?.['x-api-key'] || event.headers?.['X-API-Key'];

  if (headerKey) {
    return headerKey;
  }

  // 如果 header 沒有，從 query parameters 讀取
  const queryParams = event.queryStringParameters || {};
  const queryKey = queryParams.apiKey;

  if (queryKey) {
    return queryKey;
  }

  // 如果是 POST 請求，嘗試從 body 讀取
  if (event.httpMethod === 'POST' && event.body) {
    try {
      const parsedBody = JSON.parse(event.body);
      if (parsedBody.apiKey) {
        return parsedBody.apiKey;
      }
    } catch (e) {
      // 忽略解析錯誤
    }
  }

  return null;
}

module.exports = {
  validateApiKey,
  extractApiKey,
};


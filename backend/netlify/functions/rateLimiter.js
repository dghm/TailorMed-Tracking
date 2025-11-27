// IP Rate Limiter - 使用記憶體快取追蹤查詢次數
// 普通用戶限制：每小時最多 10 次，每分鐘最多 3 次
// API Key 用戶限制：每小時最多 50 次，每分鐘最多 10 次

// 記憶體快取：儲存 IP 查詢記錄
// 結構：Map<ip, { minuteQueries: [{ timestamp }], hourQueries: [{ timestamp }] }>
const ipCache = new Map();

// 限制配置
const RATE_LIMITS = {
  // 普通用戶限制
  default: {
    minuteLimit: 3,
    hourLimit: 10,
  },
  // API Key 用戶限制
  apiKey: {
    minuteLimit: 10,
    hourLimit: 50,
  },
};

// 清理過期記錄的間隔（毫秒）
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 每 5 分鐘清理一次

// 最後清理時間
let lastCleanup = Date.now();

// 清理過期記錄
function cleanupExpiredRecords() {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneMinuteAgo = now - 60 * 1000;

  for (const [ip, data] of ipCache.entries()) {
    // 清理超過 1 小時的記錄
    if (data.hourQueries) {
      data.hourQueries = data.hourQueries.filter(
        (record) => record.timestamp > oneHourAgo
      );
    }

    // 清理超過 1 分鐘的記錄
    if (data.minuteQueries) {
      data.minuteQueries = data.minuteQueries.filter(
        (record) => record.timestamp > oneMinuteAgo
      );
    }

    // 如果兩個陣列都空了，刪除這個 IP 的記錄
    if (
      (!data.hourQueries || data.hourQueries.length === 0) &&
      (!data.minuteQueries || data.minuteQueries.length === 0)
    ) {
      ipCache.delete(ip);
    }
  }

  lastCleanup = now;
}

// 檢查 IP 是否超過限制
// @param {string} ip - 客戶端 IP
// @param {boolean} hasApiKey - 是否有有效的 API Key
function checkRateLimit(ip, hasApiKey = false) {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneMinuteAgo = now - 60 * 1000;

  // 根據是否有 API Key 選擇限制配置
  const limits = hasApiKey ? RATE_LIMITS.apiKey : RATE_LIMITS.default;

  // 定期清理過期記錄
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    cleanupExpiredRecords();
  }

  // 如果是本地 IP，不限制（僅在開發環境）
  // 注意：如果需要測試 rate limiting，可以暫時註解掉這個檢查
  // 或者通過環境變數控制是否啟用本地 IP 排除
  // 暫時關閉本地 IP 排除，用於測試 rate limiting 功能
  const skipLocalIP = process.env.RATE_LIMIT_SKIP_LOCAL === 'true'; // 改為只有明確設定為 'true' 才跳過
  if (skipLocalIP) {
    if (
      !ip ||
      ip === 'unknown' ||
      ip.startsWith('127.') ||
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      ip === '::1'
    ) {
      console.log('ℹ️ 本地 IP 跳過 rate limit:', ip);
      return { allowed: true };
    }
  }

  // 如果 IP 是 'unknown'，仍然不限制（避免無法獲取 IP 時的問題）
  if (!ip || ip === 'unknown') {
    console.log('⚠️ IP 為 unknown，跳過 rate limit');
    return { allowed: true };
  }

  // 獲取或初始化 IP 記錄
  if (!ipCache.has(ip)) {
    ipCache.set(ip, {
      minuteQueries: [],
      hourQueries: [],
    });
  }

  const ipData = ipCache.get(ip);

  // 清理過期的記錄
  if (ipData.hourQueries) {
    ipData.hourQueries = ipData.hourQueries.filter(
      (record) => record.timestamp > oneHourAgo
    );
  }
  if (ipData.minuteQueries) {
    ipData.minuteQueries = ipData.minuteQueries.filter(
      (record) => record.timestamp > oneMinuteAgo
    );
  }

  // 檢查每分鐘限制
  const minuteCount = ipData.minuteQueries ? ipData.minuteQueries.length : 0;
  if (minuteCount >= limits.minuteLimit) {
    const oldestMinuteQuery = ipData.minuteQueries[0];
    const waitTime = Math.ceil(
      (oldestMinuteQuery.timestamp + 60 * 1000 - now) / 1000
    );
    return {
      allowed: false,
      limitType: 'minute',
      limit: limits.minuteLimit,
      waitTime: waitTime,
      message: `Rate limit exceeded. Maximum ${limits.minuteLimit} queries per minute. Please try again in ${waitTime} second(s).`,
    };
  }

  // 檢查每小時限制
  const hourCount = ipData.hourQueries ? ipData.hourQueries.length : 0;
  if (hourCount >= limits.hourLimit) {
    const oldestHourQuery = ipData.hourQueries[0];
    const waitTime = Math.ceil(
      (oldestHourQuery.timestamp + 60 * 60 * 1000 - now) / 1000 / 60
    );
    return {
      allowed: false,
      limitType: 'hour',
      limit: limits.hourLimit,
      waitTime: waitTime,
      message: `Rate limit exceeded. Maximum ${limits.hourLimit} queries per hour. Please try again in ${waitTime} minute(s).`,
    };
  }

  // 記錄這次查詢
  const queryRecord = { timestamp: now };
  if (!ipData.minuteQueries) {
    ipData.minuteQueries = [];
  }
  if (!ipData.hourQueries) {
    ipData.hourQueries = [];
  }
  ipData.minuteQueries.push(queryRecord);
  ipData.hourQueries.push(queryRecord);

  return { allowed: true };
}

// 獲取 IP 的查詢統計
function getIPStats(ip) {
  if (!ipCache.has(ip)) {
    return {
      minuteCount: 0,
      hourCount: 0,
    };
  }

  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneMinuteAgo = now - 60 * 1000;

  const ipData = ipCache.get(ip);
  const minuteQueries = (ipData.minuteQueries || []).filter(
    (record) => record.timestamp > oneMinuteAgo
  );
  const hourQueries = (ipData.hourQueries || []).filter(
    (record) => record.timestamp > oneHourAgo
  );

  return {
    minuteCount: minuteQueries.length,
    hourCount: hourQueries.length,
  };
}

module.exports = {
  checkRateLimit,
  getIPStats,
  cleanupExpiredRecords,
};

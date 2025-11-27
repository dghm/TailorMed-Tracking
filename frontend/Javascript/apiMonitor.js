(function () {
  /**
   * API Monitor - 共用監控模組
   * Version: 1.0.0 (正式版)
   *
   * 功能：
   * - 攔截並記錄所有 API 請求
   * - 記錄請求參數、回應狀態、回應時間
   * - 提取地理位置資訊（如果可用）
   * - 將記錄儲存到 localStorage
   */
  'use strict';

  const STORAGE_KEY = 'tracking_api_logs';
  const MAX_LOGS = 1000;

  // 記錄 API 請求
  function logApiRequest(requestData) {
    try {
      let logs = [];
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        logs = JSON.parse(stored);
      }

      // 添加新記錄
      logs.push({
        ...requestData,
        timestamp: new Date().toISOString(),
      });

      // 只保留最新的 MAX_LOGS 條記錄
      if (logs.length > MAX_LOGS) {
        logs = logs.slice(-MAX_LOGS);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    } catch (error) {
      console.error('Failed to log API request:', error);
    }
  }

  // 解析請求參數（從 URL 或 body）
  function extractRequestParams(url, options) {
    let orderNo = '';
    let trackingNo = '';

    try {
      // 嘗試從 URL query parameters 提取
      const urlObj = new URL(url, window.location.origin);
      orderNo =
        urlObj.searchParams.get('orderNo') ||
        urlObj.searchParams.get('order') ||
        '';
      trackingNo =
        urlObj.searchParams.get('trackingNo') ||
        urlObj.searchParams.get('tracking') ||
        '';

      // 如果是 POST 請求，嘗試從 body 提取
      if (options.body && (orderNo === '' || trackingNo === '')) {
        try {
          const bodyStr =
            typeof options.body === 'string'
              ? options.body
              : JSON.stringify(options.body);
          const bodyData = JSON.parse(bodyStr);
          orderNo = orderNo || bodyData.orderNo || bodyData.order || '';
          trackingNo =
            trackingNo ||
            bodyData.trackingNo ||
            bodyData.tracking ||
            bodyData.job ||
            '';
        } catch (e) {
          // 如果 body 不是 JSON，忽略
        }
      }
    } catch (e) {
      // URL 解析失敗，忽略
    }

    return { orderNo, trackingNo };
  }

  // 攔截 fetch 請求
  function setupFetchInterceptor() {
    const originalFetch = window.fetch;

    window.fetch = function (...args) {
      const url = args[0];
      const options = args[1] || {};
      const method = options.method || 'GET';

      // 只監控 API 請求
      if (
        typeof url === 'string' &&
        (url.includes('/api/') || url.includes('/.netlify/functions/'))
      ) {
        const startTime = Date.now();

        // 提取請求參數
        const { orderNo, trackingNo } = extractRequestParams(url, options);

        return originalFetch
          .apply(this, args)
          .then(async (response) => {
            const endTime = Date.now();
            const responseTime = endTime - startTime;

            // 嘗試從回應中提取地理位置信息（如果有）
            let location = null;
            if (response.ok) {
              try {
                const responseClone = response.clone();
                const data = await responseClone.json();
                if (data.data && data.data._location) {
                  location = data.data._location;
                }
              } catch (e) {
                // 如果解析失敗，忽略
              }
            }

            // 記錄請求
            logApiRequest({
              method: method,
              url: url,
              status: response.status,
              statusText: response.statusText,
              responseTime: responseTime,
              success: response.ok,
              page: window.location.pathname,
              orderNo: orderNo || '',
              trackingNo: trackingNo || '',
              location: location,
            });

            return response;
          })
          .catch((error) => {
            const endTime = Date.now();
            const responseTime = endTime - startTime;

            // 提取請求參數（錯誤時也需要）
            const { orderNo, trackingNo } = extractRequestParams(url, options);

            // 記錄錯誤請求
            logApiRequest({
              method: method,
              url: url,
              status: 0,
              statusText: 'Network Error',
              responseTime: responseTime,
              success: false,
              error: error.message,
              page: window.location.pathname,
              orderNo: orderNo || '',
              trackingNo: trackingNo || '',
            });

            throw error;
          });
      }

      return originalFetch.apply(this, args);
    };
  }

  // 初始化監控（在所有頁面自動執行）
  if (typeof window !== 'undefined') {
    setupFetchInterceptor();
  }

  // 導出函數供其他腳本使用
  if (typeof window !== 'undefined') {
    window.apiMonitor = {
      logRequest: logApiRequest,
      getLogs: function () {
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          return stored ? JSON.parse(stored) : [];
        } catch (error) {
          console.error('Failed to get logs:', error);
          return [];
        }
      },
      clearLogs: function () {
        try {
          localStorage.removeItem(STORAGE_KEY);
          return true;
        } catch (error) {
          console.error('Failed to clear logs:', error);
          return false;
        }
      },
    };
  }
})();

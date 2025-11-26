(function () {
  // API Monitor - 共用監控模組
  // 可以在所有頁面使用，記錄 API 請求
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

  // 攔截 fetch 請求
  function setupFetchInterceptor() {
    const originalFetch = window.fetch;
    
    window.fetch = function (...args) {
      const url = args[0];
      const options = args[1] || {};
      const method = options.method || 'GET';
      
      // 只監控 API 請求
      if (typeof url === 'string' && (url.includes('/api/') || url.includes('/.netlify/functions/'))) {
        const startTime = Date.now();
        
        return originalFetch.apply(this, args)
          .then((response) => {
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            
            // 記錄請求
            logApiRequest({
              method: method,
              url: url,
              status: response.status,
              statusText: response.statusText,
              responseTime: responseTime,
              success: response.ok,
              page: window.location.pathname,
            });
            
            return response;
          })
          .catch((error) => {
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            
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
      getLogs: function() {
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          return stored ? JSON.parse(stored) : [];
        } catch (error) {
          console.error('Failed to get logs:', error);
          return [];
        }
      },
      clearLogs: function() {
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


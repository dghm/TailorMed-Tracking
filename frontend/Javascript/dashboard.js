(function () {
  // API Dashboard - 監控 API 請求
  'use strict';

  // 從 localStorage 讀取請求記錄
  const STORAGE_KEY = 'tracking_api_logs';
  const MAX_LOGS = 1000; // 最多保存 1000 條記錄

  let requestLogs = [];
  let filteredLogs = [];

  // 初始化
  function init() {
    loadLogs();
    renderStats();
    renderRequestLogs();
    renderErrorLogs();
    setupEventListeners();
    startMonitoring();
  }

  // 從 localStorage 載入記錄（使用 apiMonitor 模組）
  function loadLogs() {
    try {
      // 使用 apiMonitor 模組讀取記錄
      if (
        window.apiMonitor &&
        typeof window.apiMonitor.getLogs === 'function'
      ) {
        requestLogs = window.apiMonitor.getLogs();
      } else {
        // 備用方案：直接從 localStorage 讀取
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          requestLogs = JSON.parse(stored);
        }
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
      requestLogs = [];
    }
  }

  // 不需要攔截 fetch（已經在 apiMonitor.js 中處理）
  function startMonitoring() {
    // 監控功能已經在 apiMonitor.js 中實現
    // 這裡只需要定期刷新數據
    setInterval(() => {
      loadLogs();
      applyFilters();
    }, 2000); // 每 2 秒刷新一次
  }

  // 渲染統計數據
  function renderStats() {
    // 只統計 tracking API 的請求（排除其他 API）
    const trackingRequests = requestLogs.filter(
      (r) =>
        r.url && (r.url.includes('/tracking') || r.url.includes('tracking'))
    );

    const total = trackingRequests.length;
    const success = trackingRequests.filter((r) => r.success).length;
    const errors = trackingRequests.filter((r) => !r.success).length;

    // 計算成功率
    const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : 0;

    // 計算平均回應時間（只計算成功的請求）
    const successfulRequests = trackingRequests.filter((r) => r.success);
    const avgResponseTime =
      successfulRequests.length > 0
        ? Math.round(
            successfulRequests.reduce(
              (sum, r) => sum + (r.responseTime || 0),
              0
            ) / successfulRequests.length
          )
        : 0;

    // 計算最快和最慢的回應時間
    const responseTimes = successfulRequests
      .map((r) => r.responseTime || 0)
      .filter((t) => t > 0);
    const minResponseTime =
      responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
    const maxResponseTime =
      responseTimes.length > 0 ? Math.max(...responseTimes) : 0;

    // 更新統計卡片
    const totalEl = document.getElementById('totalRequests');
    const successEl = document.getElementById('successRequests');
    const errorEl = document.getElementById('errorRequests');
    const avgTimeEl = document.getElementById('avgResponseTime');

    if (totalEl) totalEl.textContent = total;
    if (successEl) successEl.textContent = `${success} (${successRate}%)`;
    if (errorEl)
      errorEl.textContent = `${errors} (${(100 - successRate).toFixed(1)}%)`;
    if (avgTimeEl) {
      if (avgResponseTime > 0) {
        avgTimeEl.textContent = `${avgResponseTime}ms`;
        if (minResponseTime > 0 && maxResponseTime > 0) {
          avgTimeEl.textContent += ` (${minResponseTime}-${maxResponseTime}ms)`;
        }
      } else {
        avgTimeEl.textContent = '—';
      }
    }
  }

  // 應用過濾器
  function applyFilters() {
    const dateRange = document.getElementById('dateRange').value;
    const statusFilter = document.getElementById('statusFilter').value;

    // 只過濾 tracking API 請求
    const trackingLogs = requestLogs.filter(
      (log) =>
        log.url &&
        (log.url.includes('/tracking') || log.url.includes('tracking'))
    );

    filteredLogs = trackingLogs.filter((log) => {
      // 日期過濾
      const logDate = new Date(log.timestamp);
      const now = new Date();
      let dateMatch = true;

      if (dateRange === 'today') {
        dateMatch = logDate.toDateString() === now.toDateString();
      } else if (dateRange === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateMatch = logDate >= weekAgo;
      } else if (dateRange === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateMatch = logDate >= monthAgo;
      }

      // 狀態過濾
      let statusMatch = true;
      if (statusFilter === 'success') {
        statusMatch = log.success;
      } else if (statusFilter === 'error') {
        statusMatch = !log.success;
      }

      return dateMatch && statusMatch;
    });

    renderStats();
    renderRequestLogs();
    renderErrorLogs();
  }

  // 渲染請求日誌
  function renderRequestLogs() {
    const tbody = document.getElementById('requestLogs');
    if (!tbody) return;

    if (filteredLogs.length === 0) {
      tbody.innerHTML =
        '<tr class="dashboard-table__empty"><td colspan="6">No requests found.</td></tr>';
      return;
    }

    // 顯示最新的記錄在前
    const sortedLogs = [...filteredLogs].reverse();

    tbody.innerHTML = sortedLogs
      .slice(0, 100) // 最多顯示 100 條
      .map((log, index) => {
        const time = new Date(log.timestamp).toLocaleString('zh-TW');
        const statusClass = log.success ? 'status-success' : 'status-error';
        const statusText = log.success
          ? log.status
          : `${log.status} ${log.statusText}`;
        // 使用原始 requestLogs 的索引
        const originalIndex = requestLogs.indexOf(log);

        return `
          <tr>
            <td>${time}</td>
            <td><span class="method-badge method-${log.method.toLowerCase()}">${
          log.method
        }</span></td>
            <td class="endpoint-cell">${log.url}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${log.responseTime}ms</td>
            <td>
              <button class="btn-detail" onclick="showRequestDetails(${originalIndex})">View</button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  // 渲染錯誤日誌
  function renderErrorLogs() {
    const tbody = document.getElementById('errorLogs');
    if (!tbody) return;

    const errors = filteredLogs.filter((log) => !log.success);

    if (errors.length === 0) {
      tbody.innerHTML =
        '<tr class="dashboard-table__empty"><td colspan="4">No errors found.</td></tr>';
      return;
    }

    const sortedErrors = [...errors].reverse();

    tbody.innerHTML = sortedErrors
      .slice(0, 50) // 最多顯示 50 條錯誤
      .map((log) => {
        const time = new Date(log.timestamp).toLocaleString('zh-TW');
        // 使用原始 requestLogs 的索引
        const originalIndex = requestLogs.indexOf(log);
        return `
          <tr>
            <td>${time}</td>
            <td class="endpoint-cell">${log.url}</td>
            <td>${log.statusText || 'Error'}</td>
            <td>
              <button class="btn-detail" onclick="showErrorDetails(${originalIndex})">View</button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  // 顯示請求詳情
  window.showRequestDetails = function (index) {
    const log = requestLogs[index];
    if (!log) return;

    const details = JSON.stringify(log, null, 2);
    alert(`Request Details:\n\n${details}`);
  };

  // 顯示錯誤詳情
  window.showErrorDetails = function (index) {
    const log = requestLogs[index];
    if (!log) return;

    const details = JSON.stringify(log, null, 2);
    alert(`Error Details:\n\n${details}`);
  };

  // 設置事件監聽器
  function setupEventListeners() {
    const dateRange = document.getElementById('dateRange');
    const statusFilter = document.getElementById('statusFilter');
    const refreshBtn = document.getElementById('refreshBtn');

    if (dateRange) {
      dateRange.addEventListener('change', applyFilters);
    }

    if (statusFilter) {
      statusFilter.addEventListener('change', applyFilters);
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        loadLogs();
        applyFilters();
      });
    }
  }

  // DOM 載入完成後初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

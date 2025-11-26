(function () {
  // API Dashboard - 監控 API 請求
  'use strict';

  // 從 localStorage 讀取請求記錄
  const STORAGE_KEY = 'tracking_api_logs';
  const MAX_LOGS = 1000; // 最多保存 1000 條記錄

  let requestLogs = [];
  let filteredLogs = [];
  let successErrorBarChart = null;
  let currentRequestPage = 1;
  let currentErrorPage = 1;
  const ITEMS_PER_PAGE = 10;

  // 格式化時間為 YYYY/MM/DD HH:MM:SS
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  }

  // 初始化
  function init() {
    loadLogs();
    initCharts();
    renderStats();
    renderRequestLogs();
    renderErrorLogs();
    setupEventListeners();
    startMonitoring();
  }

  // 初始化圖表
  function initCharts() {
    // 橫式長條圖：Success/Error 比例
    const barCtx = document.getElementById('successErrorBarChart');
    if (barCtx && typeof Chart !== 'undefined') {
      // 設定 canvas 高度
      barCtx.style.height = '20px';

      successErrorBarChart = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels: [''],
          datasets: [
            {
              label: 'Success',
              data: [0],
              backgroundColor: '#143463',
              borderWidth: 0,
            },
            {
              label: 'Error',
              data: [0],
              backgroundColor: '#ccc',
              borderWidth: 0,
            },
          ],
        },
        options: {
          indexAxis: 'y', // 橫式顯示
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              enabled: false,
            },
          },
          scales: {
            x: {
              stacked: true,
              display: false,
              max: 100,
              min: 0,
            },
            y: {
              stacked: true,
              display: false,
            },
          },
        },
      });
    }
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
    // 這裡只需要定期刷新數據（不重置頁碼）
    setInterval(() => {
      loadLogs();
      // 只更新過濾後的數據，不重置頁碼
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

    // 計算今日查詢數
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const todayRequests = trackingRequests.filter((r) => {
      const logDate = new Date(r.timestamp);
      return logDate >= todayStart;
    }).length;

    // 計算本月（日曆月）總數
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthRequests = trackingRequests.filter((r) => {
      const logDate = new Date(r.timestamp);
      return logDate >= monthStart;
    }).length;

    // 計算成功率
    const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : 0;

    // 計算平均回應時間（只計算狀態碼 200 的成功請求）
    const successfulRequests = trackingRequests.filter((r) => r.status === 200);
    const avgResponseTime =
      successfulRequests.length > 0
        ? Math.round(
            successfulRequests.reduce(
              (sum, r) => sum + (r.responseTime || 0),
              0
            ) / successfulRequests.length
          )
        : 0;

    // 計算最快和最慢的回應時間（只計算狀態碼 200 的請求）
    const responseTimes = successfulRequests
      .map((r) => r.responseTime || 0)
      .filter((t) => t > 0);
    const minResponseTime =
      responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
    const maxResponseTime =
      responseTimes.length > 0 ? Math.max(...responseTimes) : 0;

    // 更新統計卡片
    const totalEl = document.getElementById('totalRequests');
    const avgTimeEl = document.getElementById('avgResponseTime');

    if (totalEl) {
      totalEl.textContent = `${todayRequests} | ${monthRequests}`;
    }
    if (avgTimeEl) {
      if (avgResponseTime > 0) {
        // 將毫秒轉換為秒，保留小數點後 2 位
        const avgSeconds = (avgResponseTime / 1000).toFixed(2);
        avgTimeEl.textContent = `${avgSeconds}s`;
      } else {
        avgTimeEl.textContent = '—';
      }
    }

    // 更新 Success/Error 橫式長條圖
    const successPercentageEl = document.getElementById('successPercentage');
    const errorPercentageEl = document.getElementById('errorPercentage');
    const barLabelsContainer = document.querySelector('.stat-card__bar-labels');

    if (successErrorBarChart) {
      if (total === 0) {
        // 沒有數據
        successErrorBarChart.data.datasets[0].data = [0];
        successErrorBarChart.data.datasets[1].data = [0];
        if (successPercentageEl) {
          successPercentageEl.textContent = '0%';
          successPercentageEl.style.textAlign = 'left';
          successPercentageEl.style.width = 'auto';
        }
        if (errorPercentageEl) {
          errorPercentageEl.textContent = '0%';
          errorPercentageEl.style.textAlign = 'right';
          errorPercentageEl.style.width = 'auto';
        }
        if (barLabelsContainer) {
          barLabelsContainer.style.justifyContent = 'space-between';
        }
      } else if (total === 1) {
        // 只有一筆數據
        if (success === 1) {
          // 100% 成功
          successErrorBarChart.data.datasets[0].data = [100];
          successErrorBarChart.data.datasets[1].data = [0];
          if (successPercentageEl) {
            successPercentageEl.textContent = '100% 成功';
            successPercentageEl.style.textAlign = 'center';
            successPercentageEl.style.width = '100%';
            successPercentageEl.style.position = 'absolute';
            successPercentageEl.style.left = '50%';
            successPercentageEl.style.transform = 'translateX(-50%)';
          }
          if (errorPercentageEl) {
            errorPercentageEl.textContent = '';
            errorPercentageEl.style.width = 'auto';
          }
          if (barLabelsContainer) {
            barLabelsContainer.style.justifyContent = 'center';
          }
        } else {
          // 100% 失敗
          successErrorBarChart.data.datasets[0].data = [0];
          successErrorBarChart.data.datasets[1].data = [100];
          if (successPercentageEl) {
            successPercentageEl.textContent = '';
            successPercentageEl.style.width = 'auto';
          }
          if (errorPercentageEl) {
            errorPercentageEl.textContent = '100% 失敗';
            errorPercentageEl.style.textAlign = 'center';
            errorPercentageEl.style.width = '100%';
            errorPercentageEl.style.position = 'absolute';
            errorPercentageEl.style.left = '50%';
            errorPercentageEl.style.transform = 'translateX(-50%)';
          }
          if (barLabelsContainer) {
            barLabelsContainer.style.justifyContent = 'center';
          }
        }
      } else {
        // 多筆數據，顯示比例
        const successPercent = ((success / total) * 100).toFixed(1);
        const errorPercent = ((errors / total) * 100).toFixed(1);

        successErrorBarChart.data.datasets[0].data = [
          parseFloat(successPercent),
        ];
        successErrorBarChart.data.datasets[1].data = [parseFloat(errorPercent)];

        if (successPercentageEl) {
          successPercentageEl.textContent = `${successPercent}%`;
          successPercentageEl.style.textAlign = 'left';
          successPercentageEl.style.width = 'auto';
          successPercentageEl.style.position = 'static';
          successPercentageEl.style.transform = 'none';
        }
        if (errorPercentageEl) {
          errorPercentageEl.textContent = `${errorPercent}%`;
          errorPercentageEl.style.textAlign = 'right';
          errorPercentageEl.style.width = 'auto';
          errorPercentageEl.style.position = 'static';
          errorPercentageEl.style.transform = 'none';
        }
        if (barLabelsContainer) {
          barLabelsContainer.style.justifyContent = 'space-between';
        }
      }
      successErrorBarChart.update('none');
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

    // 重置分頁
    currentRequestPage = 1;
    currentErrorPage = 1;

    renderStats();
    renderRequestLogs();
    renderErrorLogs();
  }

  // 渲染請求日誌
  function renderRequestLogs() {
    const tbody = document.getElementById('requestLogs');
    const pagination = document.getElementById('requestLogsPagination');
    if (!tbody) return;

    if (filteredLogs.length === 0) {
      tbody.innerHTML =
        '<tr class="dashboard-table__empty"><td colspan="7">No requests found.</td></tr>';
      if (pagination) pagination.innerHTML = '';
      return;
    }

    // 顯示最新的記錄在前
    const sortedLogs = [...filteredLogs].reverse();
    const totalPages = Math.ceil(sortedLogs.length / ITEMS_PER_PAGE);

    // 確保當前頁碼不超過總頁數
    if (currentRequestPage > totalPages && totalPages > 0) {
      currentRequestPage = totalPages;
    }

    // 計算當前頁的數據範圍
    const startIndex = (currentRequestPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageLogs = sortedLogs.slice(startIndex, endIndex);

    tbody.innerHTML = pageLogs
      .map((log, index) => {
        const time = formatTime(log.timestamp);
        const statusClass = log.success ? 'status-success' : 'status-error';
        const statusText = log.success
          ? log.status
          : `${log.status} ${log.statusText}`;
        const orderNo = log.orderNo || '—';
        const trackingNo = log.trackingNo || '—';
        // 使用原始 requestLogs 的索引
        const originalIndex = requestLogs.indexOf(log);

        return `
          <tr>
            <td>${time}</td>
            <td><span class="method-badge method-${log.method.toLowerCase()}">${
          log.method
        }</span></td>
            <td>${orderNo}</td>
            <td>${trackingNo}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${log.responseTime}ms</td>
            <td>
              <button class="btn-detail" onclick="showRequestDetails(${originalIndex})">View</button>
            </td>
          </tr>
        `;
      })
      .join('');

    // 渲染分頁
    renderPagination(pagination, currentRequestPage, totalPages, 'request');
  }

  // 渲染錯誤日誌
  function renderErrorLogs() {
    const tbody = document.getElementById('errorLogs');
    const pagination = document.getElementById('errorLogsPagination');
    if (!tbody) return;

    const errors = filteredLogs.filter((log) => !log.success);

    if (errors.length === 0) {
      tbody.innerHTML =
        '<tr class="dashboard-table__empty"><td colspan="5">No errors found.</td></tr>';
      if (pagination) pagination.innerHTML = '';
      return;
    }

    const sortedErrors = [...errors].reverse();
    const totalPages = Math.ceil(sortedErrors.length / ITEMS_PER_PAGE);

    // 確保當前頁碼不超過總頁數
    if (currentErrorPage > totalPages && totalPages > 0) {
      currentErrorPage = totalPages;
    }

    // 計算當前頁的數據範圍
    const startIndex = (currentErrorPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageErrors = sortedErrors.slice(startIndex, endIndex);

    tbody.innerHTML = pageErrors
      .map((log) => {
        const time = formatTime(log.timestamp);
        const orderNo = log.orderNo || '—';
        const trackingNo = log.trackingNo || '—';
        const errorMessage = log.statusText || log.error || 'Error';
        // 使用原始 requestLogs 的索引
        const originalIndex = requestLogs.indexOf(log);
        return `
          <tr>
            <td>${time}</td>
            <td>${orderNo}</td>
            <td>${trackingNo}</td>
            <td>${errorMessage}</td>
            <td>
              <button class="btn-detail" onclick="showErrorDetails(${originalIndex})">View</button>
            </td>
          </tr>
        `;
      })
      .join('');

    // 渲染分頁
    renderPagination(pagination, currentErrorPage, totalPages, 'error');
  }

  // 渲染分頁控制
  function renderPagination(container, currentPage, totalPages, type) {
    if (!container) return;

    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    let paginationHTML = '<div class="pagination">';

    // 上一頁按鈕
    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    paginationHTML += `<button class="pagination-btn ${prevDisabled}" onclick="goToPage('${type}', ${
      currentPage - 1
    })" ${prevDisabled ? 'disabled' : ''}>Previous</button>`;

    // 頁碼按鈕
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
      paginationHTML += `<button class="pagination-btn" onclick="goToPage('${type}', 1)">1</button>`;
      if (startPage > 2) {
        paginationHTML += '<span class="pagination-ellipsis">...</span>';
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      const activeClass = i === currentPage ? 'active' : '';
      paginationHTML += `<button class="pagination-btn ${activeClass}" onclick="goToPage('${type}', ${i})">${i}</button>`;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        paginationHTML += '<span class="pagination-ellipsis">...</span>';
      }
      paginationHTML += `<button class="pagination-btn" onclick="goToPage('${type}', ${totalPages})">${totalPages}</button>`;
    }

    // 下一頁按鈕
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';
    paginationHTML += `<button class="pagination-btn ${nextDisabled}" onclick="goToPage('${type}', ${
      currentPage + 1
    })" ${nextDisabled ? 'disabled' : ''}>Next</button>`;

    paginationHTML += '</div>';
    container.innerHTML = paginationHTML;
  }

  // 切換頁碼
  window.goToPage = function (type, page) {
    if (type === 'request') {
      currentRequestPage = page;
      renderRequestLogs();
    } else if (type === 'error') {
      currentErrorPage = page;
      renderErrorLogs();
    }
  };

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

  // 清除所有記錄
  function clearAllLogs() {
    if (
      confirm(
        'Are you sure you want to clear all monitoring data? This action cannot be undone.'
      )
    ) {
      try {
        // 使用 apiMonitor 模組清除記錄
        if (
          window.apiMonitor &&
          typeof window.apiMonitor.clearLogs === 'function'
        ) {
          window.apiMonitor.clearLogs();
        } else {
          // 備用方案：直接清除 localStorage
          localStorage.removeItem(STORAGE_KEY);
        }

        // 重置數據
        requestLogs = [];
        filteredLogs = [];

        // 重置分頁
        currentRequestPage = 1;
        currentErrorPage = 1;

        // 重新渲染
        renderStats();
        renderRequestLogs();
        renderErrorLogs();

        // 重置圖表
        if (successErrorBarChart) {
          successErrorBarChart.data.datasets[0].data = [0];
          successErrorBarChart.data.datasets[1].data = [0];
          successErrorBarChart.update('none');
        }
        const successPercentageEl =
          document.getElementById('successPercentage');
        const errorPercentageEl = document.getElementById('errorPercentage');
        if (successPercentageEl) {
          successPercentageEl.textContent = '0%';
          successPercentageEl.style.textAlign = 'left';
          successPercentageEl.style.width = 'auto';
        }
        if (errorPercentageEl) {
          errorPercentageEl.textContent = '0%';
          errorPercentageEl.style.textAlign = 'right';
          errorPercentageEl.style.width = 'auto';
        }

        console.log('✅ All monitoring data cleared');
      } catch (error) {
        console.error('Failed to clear logs:', error);
        alert('Failed to clear monitoring data. Please try again.');
      }
    }
  }

  // 設置事件監聽器
  function setupEventListeners() {
    const dateRange = document.getElementById('dateRange');
    const statusFilter = document.getElementById('statusFilter');
    const refreshBtn = document.getElementById('refreshBtn');
    const clearBtn = document.getElementById('clearBtn');

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

    if (clearBtn) {
      clearBtn.addEventListener('click', clearAllLogs);
    }
  }

  // DOM 載入完成後初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

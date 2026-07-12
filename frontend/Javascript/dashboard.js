(function () {
  /**
   * TailorMed Tracking System - API Monitoring Dashboard
   * Version: 2.0.0
   *
   * 改為從後端 /api/logs 讀取 Airtable TrackingLogs，顯示所有客戶的真實查詢記錄。
   */
  'use strict';

  const DASHBOARD_KEY_STORAGE = 'dashboard_key';

  let requestLogs = [];
  let filteredLogs = [];
  let successErrorBarChart = null;
  let currentRequestPage = 1;
  let currentErrorPage = 1;
  const ITEMS_PER_PAGE = 10;

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

  function getDashboardKey() {
    return sessionStorage.getItem(DASHBOARD_KEY_STORAGE) || '';
  }

  // 從後端 API 讀取記錄
  async function fetchLogs(dateRange, status) {
    const apiBase = window.CONFIG?.API_BASE_URL || '/.netlify/functions';
    const params = new URLSearchParams({ dateRange: dateRange || 'week', status: status || 'all', pageSize: '200' });
    const url = `${apiBase}/logs?${params}`;
    const headers = { 'Content-Type': 'application/json' };
    const key = getDashboardKey();
    if (key) headers['X-Dashboard-Key'] = key;

    const response = await fetch(url, { headers });

    if (response.status === 401) {
      // 需要密碼
      const entered = prompt('請輸入 Dashboard 存取密碼：');
      if (entered) {
        sessionStorage.setItem(DASHBOARD_KEY_STORAGE, entered);
        return fetchLogs(dateRange, status);
      }
      return [];
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    return data.records || [];
  }

  async function loadLogs() {
    const dateRange = document.getElementById('dateRange')?.value || 'week';
    const status = document.getElementById('statusFilter')?.value || 'all';
    try {
      requestLogs = await fetchLogs(dateRange, status);
      filteredLogs = requestLogs;
    } catch (err) {
      console.error('Failed to load logs:', err);
      requestLogs = [];
      filteredLogs = [];
    }
  }

  function init() {
    initCharts();
    loadLogs().then(() => {
      renderStats();
      renderRequestLogs();
      renderErrorLogs();
    });
    setupEventListeners();
  }

  function initCharts() {
    const barCtx = document.getElementById('successErrorBarChart');
    if (barCtx && typeof Chart !== 'undefined') {
      barCtx.style.height = '20px';
      successErrorBarChart = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels: [''],
          datasets: [
            { label: 'Success', data: [0], backgroundColor: '#143463', borderWidth: 0 },
            { label: 'Error', data: [0], backgroundColor: '#ccc', borderWidth: 0 },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: {
            x: { stacked: true, display: false, max: 100, min: 0 },
            y: { stacked: true, display: false },
          },
        },
      });
    }
  }

  function renderStats() {
    const total = filteredLogs.length;
    const success = filteredLogs.filter((r) => r.Success).length;
    const errors = filteredLogs.filter((r) => !r.Success).length;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const todayCount = filteredLogs.filter((r) => new Date(r.Timestamp) >= todayStart).length;
    const monthCount = filteredLogs.filter((r) => new Date(r.Timestamp) >= monthStart).length;

    const successfulRequests = filteredLogs.filter((r) => r.StatusCode === 200);
    const avgResponseTime =
      successfulRequests.length > 0
        ? Math.round(successfulRequests.reduce((s, r) => s + (r.ResponseTimeMs || 0), 0) / successfulRequests.length)
        : 0;

    const totalEl = document.getElementById('totalRequests');
    const avgTimeEl = document.getElementById('avgResponseTime');

    if (totalEl) totalEl.textContent = `${todayCount} | ${monthCount}`;
    if (avgTimeEl) {
      avgTimeEl.textContent = avgResponseTime > 0 ? `${(avgResponseTime / 1000).toFixed(2)}s` : '—';
    }

    updateBarChart(total, success, errors);
  }

  function updateBarChart(total, success, errors) {
    if (!successErrorBarChart) return;
    const successPercentageEl = document.getElementById('successPercentage');
    const errorPercentageEl = document.getElementById('errorPercentage');
    const barLabels = document.querySelector('.stat-card__bar-labels');

    if (total === 0) {
      successErrorBarChart.data.datasets[0].data = [0];
      successErrorBarChart.data.datasets[1].data = [0];
      if (successPercentageEl) successPercentageEl.textContent = '0%';
      if (errorPercentageEl) errorPercentageEl.textContent = '0%';
      if (barLabels) barLabels.style.justifyContent = 'space-between';
    } else {
      const sp = ((success / total) * 100).toFixed(1);
      const ep = ((errors / total) * 100).toFixed(1);
      successErrorBarChart.data.datasets[0].data = [parseFloat(sp)];
      successErrorBarChart.data.datasets[1].data = [parseFloat(ep)];
      if (successPercentageEl) { successPercentageEl.textContent = `${sp}%`; successPercentageEl.style = ''; }
      if (errorPercentageEl) { errorPercentageEl.textContent = `${ep}%`; errorPercentageEl.style = ''; }
      if (barLabels) barLabels.style.justifyContent = 'space-between';
    }
    successErrorBarChart.update('none');
  }

  async function applyFilters() {
    await loadLogs();
    currentRequestPage = 1;
    currentErrorPage = 1;
    renderStats();
    renderRequestLogs();
    renderErrorLogs();
  }

  function renderRequestLogs() {
    const tbody = document.getElementById('requestLogs');
    const pagination = document.getElementById('requestLogsPagination');
    if (!tbody) return;

    if (filteredLogs.length === 0) {
      tbody.innerHTML = '<tr class="dashboard-table__empty"><td colspan="7">No requests found.</td></tr>';
      if (pagination) pagination.innerHTML = '';
      return;
    }

    const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
    if (currentRequestPage > totalPages) currentRequestPage = totalPages;

    const start = (currentRequestPage - 1) * ITEMS_PER_PAGE;
    const page = filteredLogs.slice(start, start + ITEMS_PER_PAGE);

    tbody.innerHTML = page
      .map((log, i) => {
        const statusClass = log.Success ? 'status-success' : 'status-error';
        const statusText = log.Success ? log.StatusCode : `${log.StatusCode} ${log.ErrorType || ''}`.trim();
        return `
          <tr>
            <td>${formatTime(log.Timestamp)}</td>
            <td><span class="method-badge method-${(log.Method || 'get').toLowerCase()}">${log.Method || 'GET'}</span></td>
            <td>${log.OrderNo || '—'}</td>
            <td>${log.TrackingNo || '—'}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${log.ResponseTimeMs ? log.ResponseTimeMs + 'ms' : '—'}</td>
            <td><button class="btn-detail" onclick="showRequestDetails(${start + i})">View</button></td>
          </tr>`;
      })
      .join('');

    renderPagination(pagination, currentRequestPage, totalPages, 'request');
  }

  function renderErrorLogs() {
    const tbody = document.getElementById('errorLogs');
    const pagination = document.getElementById('errorLogsPagination');
    if (!tbody) return;

    const errors = filteredLogs.filter((log) => !log.Success);

    if (errors.length === 0) {
      tbody.innerHTML = '<tr class="dashboard-table__empty"><td colspan="5">No errors found.</td></tr>';
      if (pagination) pagination.innerHTML = '';
      return;
    }

    const totalPages = Math.ceil(errors.length / ITEMS_PER_PAGE);
    if (currentErrorPage > totalPages) currentErrorPage = totalPages;

    const start = (currentErrorPage - 1) * ITEMS_PER_PAGE;
    const page = errors.slice(start, start + ITEMS_PER_PAGE);

    tbody.innerHTML = page
      .map((log, i) => {
        const originalIndex = filteredLogs.indexOf(log);
        return `
          <tr>
            <td>${formatTime(log.Timestamp)}</td>
            <td>${log.OrderNo || '—'}</td>
            <td>${log.TrackingNo || '—'}</td>
            <td>${log.ErrorMessage || log.ErrorType || 'Error'}</td>
            <td><button class="btn-detail" onclick="showRequestDetails(${originalIndex})">View</button></td>
          </tr>`;
      })
      .join('');

    renderPagination(pagination, currentErrorPage, totalPages, 'error');
  }

  function renderPagination(container, currentPage, totalPages, type) {
    if (!container || totalPages <= 1) {
      if (container) container.innerHTML = '';
      return;
    }

    const max = 5;
    let s = Math.max(1, currentPage - Math.floor(max / 2));
    let e = Math.min(totalPages, s + max - 1);
    if (e - s < max - 1) s = Math.max(1, e - max + 1);

    let html = '<div class="pagination">';
    html += `<button class="pagination-btn${currentPage === 1 ? ' disabled' : ''}" onclick="goToPage('${type}',${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>`;
    if (s > 1) { html += `<button class="pagination-btn" onclick="goToPage('${type}',1)">1</button>`; if (s > 2) html += '<span class="pagination-ellipsis">...</span>'; }
    for (let i = s; i <= e; i++) html += `<button class="pagination-btn${i === currentPage ? ' active' : ''}" onclick="goToPage('${type}',${i})">${i}</button>`;
    if (e < totalPages) { if (e < totalPages - 1) html += '<span class="pagination-ellipsis">...</span>'; html += `<button class="pagination-btn" onclick="goToPage('${type}',${totalPages})">${totalPages}</button>`; }
    html += `<button class="pagination-btn${currentPage === totalPages ? ' disabled' : ''}" onclick="goToPage('${type}',${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>`;
    html += '</div>';
    container.innerHTML = html;
  }

  window.goToPage = function (type, page) {
    if (type === 'request') { currentRequestPage = page; renderRequestLogs(); }
    else if (type === 'error') { currentErrorPage = page; renderErrorLogs(); }
  };

  window.showRequestDetails = function (index) {
    const log = filteredLogs[index];
    if (!log) return;
    alert(`Request Details:\n\n${JSON.stringify(log, null, 2)}`);
  };

  function setupEventListeners() {
    document.getElementById('dateRange')?.addEventListener('change', applyFilters);
    document.getElementById('statusFilter')?.addEventListener('change', applyFilters);
    document.getElementById('refreshBtn')?.addEventListener('click', applyFilters);
    document.getElementById('clearBtn')?.addEventListener('click', () => {
      alert('記錄存在 Airtable，請直接至 Airtable TrackingLogs 表格管理。');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

(function () {
// TailorMed 貨件追蹤系統 - API 整合

// API 設定（從 config.js 讀取，如果沒有則使用預設值）
const API_BASE_URL = window.CONFIG?.API_BASE_URL || 'http://localhost:3000/api';

// 使用追蹤功能（最小影響）
function trackUsage(action, data) {
  try {
    // 非阻塞式追蹤，不影響主要功能
    setTimeout(() => {
      fetch(`${API_BASE_URL}/usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action,
          data: data,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          referrer: document.referrer,
          url: window.location.href
        })
      }).catch(() => {}); // 靜默處理錯誤，不影響主要功能
    }, 0);
  } catch (error) {
    // 靜默處理，不影響主要功能
  }
}

// DOM 元素
const trackingForm = document.querySelector('.summary-form') || document.querySelector('#trackingForm');
const orderInput = document.querySelector('#orderNo') || document.querySelector('input[name="order"]');
const jobInput = document.querySelector('#trackingNo') || document.querySelector('input[name="job"]');
const resultsPanel = document.querySelector('.results-panel');
const lookupPanel = document.querySelector('.tracking-lookup-panel');
const statusPanel = document.querySelector('.status-panel');
const defaultResultsDescription = document.querySelector('.results-description')?.textContent || '';

function getOrCreateResultsMessage() {
  if (!resultsPanel) return null;
  let messageBox = resultsPanel.querySelector('.results-message');
  if (!messageBox) {
    messageBox = document.createElement('div');
    messageBox.className = 'results-message';
    const container = resultsPanel.querySelector('.results-container');
    if (container) {
      resultsPanel.insertBefore(messageBox, container);
    } else {
      resultsPanel.appendChild(messageBox);
    }
  }
  return messageBox;
}

function showResultsMessage(type, message) {
  if (!resultsPanel) return;

  resultsPanel.classList.remove('is-loading', 'is-error');
  resultsPanel.classList.remove('is-hidden');
  resultsPanel.classList.add('is-empty');
  const messageBox = getOrCreateResultsMessage();
  const container = resultsPanel.querySelector('.results-container');
  const timelineContent = resultsPanel.querySelector('.timeline-content');
  const description = resultsPanel.querySelector('.results-description');

  if (type === 'loading') {
    resultsPanel.classList.add('is-loading');
  } else if (type === 'error') {
    resultsPanel.classList.add('is-error');
  }

  if (messageBox) {
    let illustration = '';

    if (type === 'loading') {
      illustration = `
        <div class="results-message__illustration results-message__illustration--loading">
          <img class="results-message__illustration-line" src="images/dataSearching-line.svg" alt="Tracking search animation line">
          <img class="results-message__illustration-car" src="images/dataSearching-car.svg" alt="Tracking search animation car">
        </div>
      `;
    } else if (type === 'error') {
      illustration = `
        <div class="results-message__illustration">
          <img src="images/noData.svg" alt="No data found illustration">
        </div>
      `;
    }

    messageBox.innerHTML = `
      ${illustration}
      <p>${message}</p>
    `;
    messageBox.style.display = 'block';
  }

  if (container) {
    container.style.display = 'none';
  }

  if (timelineContent) {
    timelineContent.style.display = 'none';
  }

  if (description && type !== 'success') {
    description.textContent = message;
  }
}

function clearResultsMessage() {
  if (!resultsPanel) return;

  resultsPanel.classList.remove('is-loading', 'is-error');
  const messageBox = resultsPanel.querySelector('.results-message');
  const container = resultsPanel.querySelector('.results-container');
  const timelineContent = resultsPanel.querySelector('.timeline-content');
  const description = resultsPanel.querySelector('.results-description');

  if (messageBox) {
    messageBox.innerHTML = '';
    messageBox.style.display = 'none';
  }

  if (container) {
    container.style.display = '';
  }

  if (timelineContent) {
    timelineContent.style.display = '';
  }

  if (description) {
    description.textContent = defaultResultsDescription;
  }

  resultsPanel.classList.remove('is-empty', 'is-hidden');
}

function scrollToResultsPanel(offset = 85) {
  if (!resultsPanel) return;
  const panelTop =
    resultsPanel.getBoundingClientRect().top + window.pageYOffset - offset;
  window.scrollTo({
    top: panelTop < 0 ? 0 : panelTop,
    behavior: 'smooth',
  });
}

// 狀態訊息
const STATUS_MESSAGES = {
  loading: '正在查詢貨件狀態，請稍候...',
  notFound: '查無此追蹤編號的記錄，請確認編號是否正確。',
  error: '服務暫時無法使用，稍候再試或聯絡客服人員。',
  timeout: '查詢逾時，請稍後再試。'
};

// 開發調試用：強制停留在載入畫面
const FORCE_LOADING_PREVIEW = false;

// Demo 用載入最短顯示時間（毫秒）
const MIN_LOADING_TIME = 0;
const MAX_QUERY_TIME = 3000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 查詢貨件資料
async function fetchTrackingData(orderNo, trackingNo) {
  // 追蹤查詢嘗試
  trackUsage('query_attempt', { orderNo, trackingNo });
  
  const startTime = Date.now();
  
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timeoutId = null;

    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), MAX_QUERY_TIME);
    }

    // 使用 POST 方法呼叫 API（Netlify Functions 支援 POST）
    const response = await fetch(`${API_BASE_URL}/tracking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        orderNo: orderNo,
        trackingNo: trackingNo
      }),
      signal: controller?.signal
    });

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      if (response.status === 404) {
        // 追蹤查詢結果（未找到）
        trackUsage('query_result', { 
          orderNo, 
          trackingNo, 
          success: false, 
          reason: 'not_found',
          responseTime: Date.now() - startTime
        });
        return null; // 找不到資料
      }
      if (response.status === 429) {
        // 追蹤查詢結果（限制）
        trackUsage('query_result', { 
          orderNo, 
          trackingNo, 
          success: false, 
          reason: 'rate_limit',
          responseTime: Date.now() - startTime
        });
        // 查詢次數超過限制
        const errorData = await response.json();
        return { 
          error: 'rate_limit', 
          message: errorData.message || '查詢次數已達上限，請稍後再試。'
        };
      }
      throw new Error('Network response was not ok');
    }

    const data = await response.json();
    const result = data.success ? data.data : null;
    
    // 追蹤查詢結果（成功）
    trackUsage('query_result', { 
      orderNo, 
      trackingNo, 
      success: !!result, 
      reason: result ? 'success' : 'no_data',
      responseTime: Date.now() - startTime
    });
    
    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    if (error.name === 'AbortError') {
      trackUsage('query_result', {
        orderNo,
        trackingNo,
        success: false,
        reason: 'timeout',
        responseTime
      });
      return { error: 'timeout', message: STATUS_MESSAGES.timeout };
    }

    // 追蹤查詢結果（錯誤）
    trackUsage('query_result', { 
      orderNo, 
      trackingNo, 
      success: false, 
      reason: 'error',
      responseTime,
      error: error.message
    });
    
    console.error('Fetch tracking data failed:', error);
    return 'error';
  }
}

// 渲染貨件資訊
function renderShipmentInfo(shipmentData) {
  if (!shipmentData) return;

  const timelineItems = Array.isArray(shipmentData.timeline)
    ? shipmentData.timeline.slice()
    : [];

  const latestTimelineEntry = timelineItems
    .slice()
    .reverse()
    .find((item) => item && !item.isEvent && (item.time || item.date));

  const statusText = latestTimelineEntry?.title || shipmentData.status || 'Processing';
  const timelineDate = latestTimelineEntry?.date || '';
  const timelineTime = latestTimelineEntry?.time || '';
  const combinedTimelineDateTime = [timelineDate, timelineTime].filter(Boolean).join(' ').trim();
  const lastUpdateText =
    combinedTimelineDateTime ||
    shipmentData.lastUpdate ||
    '—';


  // 更新基本資訊
  const summaryFields = {
    'Order No.': shipmentData.orderNo || '—',
    'Original/Destination': (() => {
      if (shipmentData.originDestination && shipmentData.originDestination.trim()) {
        return shipmentData.originDestination;
      }
      if (shipmentData.origin && shipmentData.destination) {
        return `${shipmentData.origin} → ${shipmentData.destination}`;
      }
      return shipmentData.route || '—';
    })(),
    'Origin': 'hidden',
    'Destination': 'hidden',
    'Package Count': shipmentData.packageCount || '—',
    'Weight': shipmentData.weight ? `${shipmentData.weight} KG` : '—',
    'ETA': shipmentData.eta || '—'
  };

  // 更新 summary grid
  const summaryGrid = document.querySelector('.summary-grid');
  if (summaryGrid) {
    summaryGrid.innerHTML = '';
    Object.entries(summaryFields).forEach(([label, value]) => {
      if (value === 'hidden') {
        return;
      }
      const field = document.createElement('div');
      field.className = 'summary-field';
      field.innerHTML = `
        <span class="field-label">${label}</span>
        <span class="field-value">${value}</span>
      `;
      summaryGrid.appendChild(field);
    });
  }

  // 更新狀態資訊
  const statusInfo = document.querySelector('.status-info');
  if (statusInfo) {
    // 檢查是否有 Dry Ice Event
    const hasDryIceEvent = shipmentData.timeline?.some(item => item.isEvent && item.eventType === 'dryice');
    
    statusInfo.innerHTML = `
      <div class="summary-field">
        <span class="field-label">Tracking No.</span>
        <span class="field-value">${shipmentData.trackingNo}</span>
      </div>
      <div class="summary-field status-field">
        <span class="field-label">Status</span>
        <div class="status-value-wrapper">
          <span class="field-value status-inline status-in-transit">${statusText}</span>
          ${hasDryIceEvent ? `
            <div class="status-icon-wrapper" data-tooltip="Dry Ice Refilled">
              <img class="status-icon" src="images/icon-dryice.svg" alt="Dry Ice Refilled">
            </div>
          ` : ''}
        </div>
      </div>
      <div class="summary-field">
        <span class="field-label">Last Update</span>
        <span class="field-value">${lastUpdateText}</span>
      </div>
    `;
  }
}

// 渲染時間軸
function renderTimeline(timeline) {
  if (!timeline || timeline.length === 0) return;

  const timelinePlaceholder = document.querySelector('.timeline-placeholder');
  if (timelinePlaceholder) {
    timelinePlaceholder.classList.add('is-hidden');
  }

  // 計算進度百分比（排除 event 項目）
  const steps = timeline.filter(item => item.step !== null);
  const completedSteps = steps.filter(item => item.status === 'completed').length;
  const progressPercentage = (completedSteps / (steps.length - 1)) * 100;

  // 更新進度條
  const progressBar = document.querySelector('.timeline-progress');
  if (progressBar) {
    progressBar.style.width = `${progressPercentage}%`;
  }

  // 更新 timeline nodes
  const timelineNodes = document.querySelector('.timeline-nodes');
  if (timelineNodes) {
    timelineNodes.innerHTML = '';
    
    timeline.forEach((item) => {
      // 跳過 event 項目（它們會顯示在別處）
      if (item.step === null) return;

      const node = document.createElement('div');
      node.className = `timeline-node ${item.status}`;
      node.setAttribute('data-step', item.step);
      node.innerHTML = `
        <div class="node-dot"></div>
        <div class="node-icon">${item.step}</div>
      `;
      timelineNodes.appendChild(node);
    });
  }

  // 更新 timeline cards
  const timelineCards = document.querySelector('.timeline-cards');
  if (timelineCards) {
    timelineCards.innerHTML = '';
    
    timeline.forEach((item) => {
      const card = document.createElement('div');
      
      if (item.isEvent) {
        // Dry Ice Event Card
        card.className = 'timeline-card event';
        card.innerHTML = `
          <div class="card-icon">
            <img class="card-icon-img icon-default" src="images/icon-dryice.svg" alt="Dry Ice">
            <img class="card-icon-img icon-hover" src="images/icon-dryice_hover.svg" alt="Dry Ice Hover">
          </div>
          <div class="card-content">
            <h3 class="card-title">${item.title}</h3>
            <p class="card-time">${item.time}</p>
          </div>
        `;
      } else {
        // 一般步驟 Card
        card.className = `timeline-card ${item.status}`;
        card.setAttribute('data-step', item.step);
        card.innerHTML = `
          <div class="card-step">Step ${item.step}</div>
          <div class="card-content">
            <h3 class="card-title">${item.title}</h3>
            <p class="card-time">${item.time}</p>
          </div>
        `;
      }
      
      timelineCards.appendChild(card);
    });
  }

  // 如果有 Dry Ice Event，添加時間軸圖示
  const dryIceEvent = timeline.find(item => item.isEvent && item.eventType === 'dryice');
  if (dryIceEvent) {
    const eventIcon = document.querySelector('.timeline-event-icon');
    if (!eventIcon && timelineNodes) {
      const icon = document.createElement('div');
      icon.className = 'timeline-event-icon';
      icon.innerHTML = '<img src="images/icon-dryice.svg" alt="Dry Ice Refilled">';
      timelineNodes.parentElement.appendChild(icon);
    }
  }
}

// 顯示載入狀態
function showLoading() {
  showResultsMessage('loading', STATUS_MESSAGES.loading);
}

// 顯示錯誤訊息
function showError(message) {
  showResultsMessage('error', message);
}

// 處理表單提交
async function handleFormSubmit(event) {
  event.preventDefault();

  if (!orderInput || !jobInput) {
    return;
  }

  const orderNo = orderInput.value.trim().toUpperCase();
  const trackingNo = jobInput.value.trim().toUpperCase();

  if (!orderNo || !trackingNo) return;

  // 顯示載入狀態
  showLoading();
  scrollToResultsPanel();

  const [result] = await Promise.all([
    fetchTrackingData(orderNo, trackingNo),
    wait(MIN_LOADING_TIME)
  ]);

  // 處理結果
  if (result === 'error') {
    showError(STATUS_MESSAGES.error);
    return;
  }

  // 處理查詢次數限制
  if (result && result.error === 'rate_limit') {
    showResultsMessage('error', result.message || STATUS_MESSAGES.error);
    return;
  }

  if (result && result.error === 'timeout') {
    showResultsMessage('error', result.message || STATUS_MESSAGES.timeout);
    return;
  }

  if (!result) {
    showResultsMessage('error', STATUS_MESSAGES.notFound);
    return;
  }

  clearResultsMessage();

  // 渲染資料
  renderShipmentInfo(result);
  renderTimeline(result.timeline);

  // 更新 URL (不刷新頁面)
  const url = new URL(window.location);
  url.searchParams.set('order', orderNo);
  url.searchParams.set('tracking', trackingNo);
  window.history.pushState({}, '', url);

  // 滾動到結果區域（額外保留 75px 空間）
  scrollToResultsPanel();
}

// 從 URL 參數初始化
function initFromURL() {
  const params = new URLSearchParams(window.location.search);
  const orderNo = params.get('order');
  const trackingNo = params.get('tracking');

  if (orderInput && orderNo) {
    orderInput.value = orderNo;
  }

  if (jobInput && trackingNo) {
    jobInput.value = trackingNo;
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 追蹤頁面載入
  trackUsage('page_load', {
    url: window.location.href,
    referrer: document.referrer,
    userAgent: navigator.userAgent
  });
  
  // 綁定表單提交事件
  if (trackingForm) {
    trackingForm.addEventListener('submit', handleFormSubmit);
  }

  // 從 URL 初始化
  initFromURL();

  // 重新初始化互動效果（在動態內容載入後）
  window.addEventListener('contentLoaded', () => {
    // 觸發 resize 事件以重新計算位置
    window.dispatchEvent(new Event('resize'));
  });
});

})();


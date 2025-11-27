(function () {
  /**
   * TailorMed 貨件追蹤系統 - API 整合
   * Version: 1.0.0 (正式版)
   *
   * 功能：
   * - 貨件追蹤查詢
   * - 查詢結果顯示
   * - 錯誤處理與用戶提示
   */

  // API 設定（從 config.js 讀取，如果沒有則使用預設值）
  const API_BASE_URL =
    window.CONFIG?.API_BASE_URL || 'http://localhost:3000/api';

  // 使用追蹤功能（已禁用）
  // 注意：此功能需要後端有對應的 /api/usage endpoint
  // 由於後端沒有 usage function，此功能已完全禁用以避免 404 錯誤
  function trackUsage(action, data) {
    // 完全禁用此功能，避免 404 錯誤
    return;
  }

  // DOM 元素
  const trackingForm =
    document.querySelector('.summary-form') ||
    document.querySelector('#trackingForm');
  const orderInput =
    document.querySelector('#orderNo') ||
    document.querySelector('input[name="order"]');
  const jobInput =
    document.querySelector('#trackingNo') ||
    document.querySelector('input[name="job"]');
  const resultsPanel = document.querySelector('.results-panel');
  const lookupPanel = document.querySelector('.tracking-lookup-panel');
  const statusPanel = document.querySelector('.status-panel');
  const defaultResultsDescription =
    document.querySelector('.results-description')?.textContent || '';

  if (orderInput) {
    orderInput.addEventListener('input', () => {
      orderInput.setCustomValidity('');
    });
    orderInput.addEventListener('invalid', (event) => {
      event.preventDefault();
      orderInput.setCustomValidity('Please enter Job No.');
      orderInput.reportValidity();
    });
  }

  if (jobInput) {
    jobInput.addEventListener('input', () => {
      jobInput.setCustomValidity('');
    });
    jobInput.addEventListener('invalid', (event) => {
      event.preventDefault();
      jobInput.setCustomValidity('Please enter Tracking No.');
      jobInput.reportValidity();
    });
  }

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

  function showResultsMessage(type, message, errorType = null) {
    if (!resultsPanel) return;

    resultsPanel.classList.remove('is-loading', 'is-error');
    resultsPanel.classList.remove('is-hidden');
    resultsPanel.classList.add('is-empty');
    const messageBox = getOrCreateResultsMessage();
    const container = resultsPanel.querySelector('.results-container');
    const timelineContent = resultsPanel.querySelector('.timeline-content');
    const description = resultsPanel.querySelector('.results-description');
    const resultsNote = resultsPanel.querySelector('.results-note');

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
          <img src="images/dataSearching-car.svg" alt="Tracking search animation car">
        </div>
      `;
      } else if (type === 'error') {
        // 根據錯誤類型顯示不同的圖標
        let errorIcon = 'images/noData.svg';
        let errorAlt = 'No data found illustration';

        if (errorType === 'rate_limit') {
          errorIcon = 'images/rateLimit.svg';
          errorAlt = 'Rate limit exceeded illustration';
        }

        illustration = `
        <div class="results-message__illustration">
          <img src="${errorIcon}" alt="${errorAlt}">
        </div>
      `;
      }

      messageBox.innerHTML = `
      ${illustration}
      <p class="results-message__text${
        type === 'loading' ? ' results-message__text--loading' : ''
      }">${message}</p>
    `;
      messageBox.style.display = 'block';
    }

    if (container) {
      container.style.display = 'none';
    }

    if (timelineContent) {
      timelineContent.style.display = 'none';
    }

    if (resultsNote) {
      resultsNote.style.display = 'none';
    }

    updateApiDebugPanel(null);

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
    const resultsNote = resultsPanel.querySelector('.results-note');

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

    if (resultsNote) {
      resultsNote.style.display = '';
    }

    resultsPanel.classList.remove('is-empty', 'is-hidden');
  }

  function updateApiDebugPanel(data) {
    if (!resultsPanel) return;
    const panel = resultsPanel.querySelector('.api-debug-panel');
    const body = panel?.querySelector('.api-debug-panel__body');
    if (!panel || !body) return;

    if (!data) {
      panel.classList.add('is-hidden');
      body.textContent = 'No data loaded yet.';
      return;
    }

    panel.classList.remove('is-hidden');
    body.textContent = JSON.stringify(data, null, 2);
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
    loading: 'Retrieving your shipment status. Just a moment...',
    notFound:
      "We couldn't find any shipment that matches the information provided.\n\nPlease double-check your Job No. and Tracking No. and try again.",
    error: '服務暫時無法使用，稍候再試或聯絡客服人員。',
    timeout:
      "We couldn't find any shipment that matches the information provided.\n\nPlease double-check your Job No. and Tracking No. and try again.",
  };

  // 開發調試用：強制停留在載入畫面
  const FORCE_LOADING_PREVIEW = false;

  // Demo 用載入最短顯示時間（毫秒）
  const MIN_LOADING_TIME = 0;
  const MAX_QUERY_TIME = 7000;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function formatDateToDDMMYYYY(value) {
    if (!value) return '';

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^\d{2}\/(\d{2})\/\d{4}$/.test(trimmed)) {
        return trimmed;
      }
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return typeof value === 'string' ? value : '';
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  // 格式化日期時間為歐洲格式 DD/MM/YYYY HH:MM
  function formatDateTimeToDDMMYYYYHHMM(value) {
    if (!value) return '—';

    let date = null;
    let hours = '';
    let minutes = '';

    if (typeof value === 'string') {
      const trimmed = value.trim();

      // 嘗試解析 ISO 格式 (YYYY-MM-DD HH:MM:SS 或 YYYY-MM-DDTHH:MM:SS)
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        // 分離日期和時間部分
        const parts = trimmed.split(/[\sT]/);
        const datePart = parts[0];
        const timePart = parts[1] || '';

        // 解析 YYYY-MM-DD
        const [year, month, day] = datePart.split('-');
        date = new Date(`${year}-${month}-${day}`);

        // 解析時間 HH:MM:SS 或 HH:MM
        if (timePart) {
          const timeMatch = timePart.match(/(\d{2}):(\d{2})/);
          if (timeMatch) {
            hours = timeMatch[1];
            minutes = timeMatch[2];
          }
        }
      }
      // 嘗試解析已格式化的日期時間字串 (DD/MM/YYYY HH:MM 或類似格式)
      else if (/^\d{2}\/\d{2}\/\d{4}/.test(trimmed)) {
        const parts = trimmed.split(/\s+/);
        const datePart = parts[0];
        const timePart = parts[1] || '';

        // 解析 DD/MM/YYYY
        const [day, month, year] = datePart.split('/');
        date = new Date(`${year}-${month}-${day}`);

        if (timePart) {
          const timeMatch = timePart.match(/(\d{2}):(\d{2})/);
          if (timeMatch) {
            hours = timeMatch[1];
            minutes = timeMatch[2];
          }
        }
      }
      // 嘗試直接解析（適用於其他格式）
      else {
        date = new Date(trimmed);
        // 檢查原始字串是否有時間
        const timeMatch = trimmed.match(/(\d{2}):(\d{2})/);
        if (timeMatch) {
          hours = timeMatch[1];
          minutes = timeMatch[2];
        }
      }
    } else {
      date = new Date(value);
    }

    if (!date || Number.isNaN(date.getTime())) {
      return typeof value === 'string' ? value : '—';
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    // 如果有時間部分，使用解析到的時間，否則使用日期物件的時間
    if (hours && minutes) {
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } else if (date.getHours() !== 0 || date.getMinutes() !== 0) {
      const h = String(date.getHours()).padStart(2, '0');
      const m = String(date.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${h}:${m}`;
    }

    return `${day}/${month}/${year}`;
  }

  // 查詢貨件資料
  // 獲取 API Key（從 URL 參數或 localStorage）
  function getApiKey() {
    const params = new URLSearchParams(window.location.search);
    const apiKeyFromURL = params.get('apiKey');
    if (apiKeyFromURL) {
      return apiKeyFromURL;
    }
    // 也可以從 localStorage 讀取（如果需要的話）
    // return localStorage.getItem('apiKey');
    return null;
  }

  async function fetchTrackingData(orderNo, trackingNo) {
    // 追蹤查詢嘗試
    trackUsage('query_attempt', { orderNo, trackingNo });

    const startTime = Date.now();

    // 獲取 API Key
    const apiKey = getApiKey();

    try {
      const controller =
        typeof AbortController !== 'undefined' ? new AbortController() : null;
      let timeoutId = null;

      if (controller) {
        timeoutId = setTimeout(() => controller.abort(), MAX_QUERY_TIME);
      }

      // 準備請求 headers 和 body
      const headers = {
        'Content-Type': 'application/json',
      };

      // 如果有 API Key，添加到 header
      if (apiKey) {
        headers['X-API-Key'] = apiKey;
      }

      const body = {
        orderNo: orderNo,
        trackingNo: trackingNo,
      };

      // 如果有 API Key，也添加到 body（支援多種方式）
      if (apiKey) {
        body.apiKey = apiKey;
      }

      // 使用 POST 方法呼叫 API（Netlify Functions 支援 POST）
      const response = await fetch(`${API_BASE_URL}/tracking`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
        signal: controller?.signal,
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
            responseTime: Date.now() - startTime,
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
            responseTime: Date.now() - startTime,
          });
          // 查詢次數超過限制
          const errorData = await response.json();
          return {
            error: 'rate_limit',
            message: errorData.message || '查詢次數已達上限，請稍後再試。',
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
        responseTime: Date.now() - startTime,
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
          responseTime,
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
        error: error.message,
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

    const statusText =
      latestTimelineEntry?.title || shipmentData.status || 'Processing';
    const timelineDate = latestTimelineEntry?.date || '';
    const timelineTime = latestTimelineEntry?.time || '';
    const combinedTimelineDateTime = [timelineDate, timelineTime]
      .filter(Boolean)
      .join(' ')
      .trim();

    // 格式化 Last Update 為歐洲格式 DD/MM/YYYY HH:MM
    const lastUpdateRaw =
      combinedTimelineDateTime || shipmentData.lastUpdate || '';
    const lastUpdateText = lastUpdateRaw
      ? formatDateTimeToDDMMYYYYHHMM(lastUpdateRaw)
      : '—';

    const etaFormatted = formatDateToDDMMYYYY(shipmentData.eta);

    // 更新基本資訊
    // Original/Destination 直接顯示資料庫中的值
    const originalDestinationValue = (() => {
      // 優先使用 originDestination 欄位（資料庫中的 Origin/Destination）
      if (
        shipmentData.originDestination &&
        shipmentData.originDestination.trim()
      ) {
        return shipmentData.originDestination;
      }
      // 如果沒有，則組合 origin 和 destination
      if (shipmentData.origin && shipmentData.destination) {
        return `${shipmentData.origin} → ${shipmentData.destination}`;
      }
      // 如果都沒有，則使用 route
      if (shipmentData.route && shipmentData.route.trim()) {
        return shipmentData.route;
      }
      // 都沒有則顯示 "—"
      return '—';
    })();

    const summaryFields = {
      'Job No.': shipmentData.orderNo || '—',
      'Original/Destination': originalDestinationValue,
      Origin: 'hidden',
      Destination: 'hidden',
      'Package Count': shipmentData.packageCount || '—',
      Weight: shipmentData.weight ? `${shipmentData.weight} KG` : '—',
      ETA: etaFormatted || '—',
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
      const eventVisibility = evaluateDryIceEvents(shipmentData);
      const hasDryIceEvent = eventVisibility.hasAnyEvent;

      statusInfo.innerHTML = `
      <div class="summary-field">
        <span class="field-label">Tracking No.</span>
        <span class="field-value">${shipmentData.trackingNo}</span>
      </div>
      <div class="summary-field status-field">
        <span class="field-label">Status</span>
        <div class="status-value-wrapper">
          <span class="field-value status-inline status-in-transit">${statusText}</span>
          ${
            hasDryIceEvent
              ? `
            <div class="status-icon-wrapper" data-tooltip="Dry Ice Refilled">
              <img class="status-icon" src="images/icon-dryice.svg" alt="Dry Ice Refilled">
            </div>
          `
              : ''
          }
        </div>
      </div>
      <div class="summary-field">
        <span class="field-label">Last Update</span>
        <span class="field-value">${lastUpdateText}</span>
      </div>
    `;
    }
  }

  // Timeline 狀態與樣式對照
  const TIMELINE_STATUS_CODES = {
    EXECUTED: 1,
    PROCESSING: 2,
    INTERNATIONAL_IN_TRANSIT: 3,
    SCHEDULED: 4,
    ORDER_COMPLETED: 5,
    ORDER_FINAL: 6,
  };

  const TIMELINE_STATUS_CLASS = {
    [TIMELINE_STATUS_CODES.EXECUTED]: 'executed',
    [TIMELINE_STATUS_CODES.PROCESSING]: 'processing',
    [TIMELINE_STATUS_CODES.INTERNATIONAL_IN_TRANSIT]: 'international-transit',
    [TIMELINE_STATUS_CODES.SCHEDULED]: 'scheduled',
    [TIMELINE_STATUS_CODES.ORDER_COMPLETED]: 'order-completed',
    [TIMELINE_STATUS_CODES.ORDER_FINAL]: 'order-final',
  };

  function mapStatusCodeToLetter(statusCode) {
    switch (statusCode) {
      case TIMELINE_STATUS_CODES.EXECUTED:
        return 'a';
      case TIMELINE_STATUS_CODES.PROCESSING:
        return 'b';
      case TIMELINE_STATUS_CODES.INTERNATIONAL_IN_TRANSIT:
        return 'c';
      case TIMELINE_STATUS_CODES.SCHEDULED:
        return 'd';
      case TIMELINE_STATUS_CODES.ORDER_COMPLETED:
        return 'e';
      case TIMELINE_STATUS_CODES.ORDER_FINAL:
        return 'f';
      default:
        return '';
    }
  }

  function mapStatusStringToLetter(status) {
    const normalized = (status || '').toString().trim().toLowerCase();
    if (normalized === 'completed') return 'a';
    if (normalized === 'processing') return 'b';
    if (normalized === 'pending') return 'd';
    if (normalized.includes('order') && normalized.includes('final'))
      return 'f';
    if (normalized.includes('order') && normalized.includes('complete'))
      return 'e';
    return 'd';
  }

  function normalizeCheckboxValue(value) {
    if (Array.isArray(value)) {
      return value.some((item) => normalizeCheckboxValue(item));
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return (
        normalized === 'true' ||
        normalized === '1' ||
        normalized === 'yes' ||
        normalized === 'checked' ||
        normalized === 'y'
      );
    }
    if (typeof value === 'number') {
      return value === 1;
    }
    return Boolean(value);
  }

  function normalizeEventTitle(value) {
    if (!value || typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isCompletedLetter(letter) {
    return letter === 'a' || letter === 'e' || letter === 'f';
  }

  function evaluateDryIceEvents(shipmentData, processedSteps) {
    const rawFields = shipmentData?._raw || {};
    const timeline = Array.isArray(shipmentData?.timeline)
      ? shipmentData.timeline.slice()
      : [];

    const transportType = (shipmentData?.transportType || '').toLowerCase();
    const isInternational =
      transportType.includes('international') ||
      transportType.includes('import') ||
      transportType.includes('export') ||
      transportType.includes('cross') ||
      transportType.includes('imex');

    const events = timeline.filter((item) => item.isEvent);
    const enhancedEvents = events.map((eventItem) => {
      const normalizedTitle = normalizeEventTitle(eventItem.title);
      let eventType = eventItem.eventType || null;
      if (normalizedTitle === 'dry ice refilled(terminal)') {
        eventType = 'dryice-terminal';
      } else if (normalizedTitle === 'dry ice refilled') {
        eventType = 'dryice-standard';
      }
      return {
        ...eventItem,
        eventType,
      };
    });

    if (!isInternational) {
      return {
        shouldShowEventOne: false,
        shouldShowEventTwo: false,
        filteredEvents: enhancedEvents,
        hasAnyEvent: enhancedEvents.length > 0,
      };
    }

    const stepsSource = processedSteps
      ? processedSteps.map((step) => ({
          title: step.title || '',
          letter: mapStatusCodeToLetter(step.statusCode),
        }))
      : timeline
          .filter((item) => !item.isEvent)
          .sort((a, b) => (a.step || 0) - (b.step || 0))
          .map((item) => ({
            title: item.title || '',
            letter: mapStatusStringToLetter(item.status || ''),
          }));

    const getLetterByTitle = (title) => {
      const normalized = normalizeEventTitle(title);
      const found = stepsSource.find(
        (item) => normalizeEventTitle(item.title) === normalized
      );
      return found ? found.letter : null;
    };

    const inTransitLetter = getLetterByTitle('In Transit');
    const destCustomsLetter = getLetterByTitle('Destination Customs Process');

    const getCheckboxValue = (fieldName) => {
      const value =
        rawFields[fieldName] !== undefined
          ? rawFields[fieldName]
          : shipmentData?.[fieldName];
      return normalizeCheckboxValue(value);
    };

    const terminalChecked = getCheckboxValue('Dry Ice Refilled(Terminal)');
    const dryIceChecked = getCheckboxValue('Dry Ice Refilled');

    const shouldShowEventOne =
      terminalChecked && inTransitLetter && isCompletedLetter(inTransitLetter);

    const shouldShowEventTwo =
      dryIceChecked &&
      destCustomsLetter &&
      isCompletedLetter(destCustomsLetter);

    const filteredEvents = enhancedEvents.filter((eventItem) => {
      const titleNormalized = normalizeEventTitle(eventItem.title);
      if (titleNormalized === 'dry ice refilled(terminal)') {
        return shouldShowEventOne || isCompletedLetter(inTransitLetter);
      }
      if (titleNormalized === 'dry ice refilled') {
        return shouldShowEventTwo || isCompletedLetter(destCustomsLetter);
      }
      return true;
    });

    return {
      shouldShowEventOne,
      shouldShowEventTwo,
      filteredEvents,
      hasAnyEvent: filteredEvents.length > 0,
    };
  }

  const MONTH_ABBR = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  function parseTimelineDate(dateString) {
    if (!dateString) return null;

    const normalized = `${dateString}`.replace(/\./g, '/');
    let parsed = new Date(normalized);

    if (Number.isNaN(parsed?.getTime())) {
      const parts = normalized.split(/[\/-]/).map((part) => part.trim());
      if (parts.length >= 3) {
        const [year, month, day] = parts;
        const normalizedISO = `${year.padStart(4, '0')}-${month
          .padStart(2, '0')
          .replace(/[^\d]/g, '')}-${day
          .padStart(2, '0')
          .replace(/[^\d]/g, '')}`;
        parsed = new Date(normalizedISO);
      }
    }

    if (Number.isNaN(parsed?.getTime())) {
      return null;
    }

    return parsed;
  }

  function getTimelineDateParts(dateString) {
    const date = parseTimelineDate(dateString);
    if (!date) {
      return { month: '', day: '' };
    }

    const month = MONTH_ABBR[date.getMonth()];
    const day = String(date.getDate()).padStart(2, '0');

    return {
      month,
      day,
    };
  }

  function normalizeStatus(step) {
    if (!step || typeof step.status !== 'string') return '';
    return step.status.trim().toLowerCase();
  }

  function normalizeTitle(step) {
    if (!step || typeof step.title !== 'string') return '';
    return step.title.trim().toLowerCase();
  }

  function deriveTimelineStatusCode(step, index, steps, options) {
    const {
      isDomestic,
      isInternational,
      isOrderCompleted,
      processingIndex,
      lastCompletedIndex,
    } = options;
    const lastIndex = steps.length - 1;
    const normalizedStatus = normalizeStatus(step);
    const normalizedTitle = normalizeTitle(step);

    if (isOrderCompleted) {
      return index === lastIndex
        ? TIMELINE_STATUS_CODES.ORDER_FINAL
        : TIMELINE_STATUS_CODES.ORDER_COMPLETED;
    }

    if (processingIndex >= 0) {
      if (index < processingIndex) {
        return TIMELINE_STATUS_CODES.EXECUTED;
      }
      if (index === processingIndex) {
        if (
          isInternational &&
          normalizedTitle &&
          normalizedTitle.includes('in transit')
        ) {
          return TIMELINE_STATUS_CODES.INTERNATIONAL_IN_TRANSIT;
        }
        return TIMELINE_STATUS_CODES.PROCESSING;
      }
      return TIMELINE_STATUS_CODES.SCHEDULED;
    }

    if (normalizedStatus === 'completed') {
      return TIMELINE_STATUS_CODES.EXECUTED;
    }

    if (normalizedStatus === 'processing') {
      if (
        isInternational &&
        normalizedTitle &&
        normalizedTitle.includes('in transit')
      ) {
        return TIMELINE_STATUS_CODES.INTERNATIONAL_IN_TRANSIT;
      }
      return TIMELINE_STATUS_CODES.PROCESSING;
    }

    if (lastCompletedIndex >= 0 && index <= lastCompletedIndex) {
      return TIMELINE_STATUS_CODES.EXECUTED;
    }

    return TIMELINE_STATUS_CODES.SCHEDULED;
  }

  function renderTimeline(shipmentData) {
    if (!shipmentData) return;

    const timeline = Array.isArray(shipmentData.timeline)
      ? shipmentData.timeline
      : [];
    if (timeline.length === 0) return;

    const transportType = (shipmentData.transportType || '').toLowerCase();
    const isDomestic = transportType === 'domestic';
    const isInternational =
      transportType.includes('international') ||
      transportType.includes('import') ||
      transportType.includes('export') ||
      transportType.includes('cross') ||
      transportType.includes('imex');

    const timelinePlaceholder = document.querySelector('.timeline-placeholder');
    if (timelinePlaceholder) {
      timelinePlaceholder.classList.add('is-hidden');
    }

    const stepItems = timeline
      .filter((item) => !item.isEvent)
      .sort((a, b) => {
        const stepA = typeof a.step === 'number' ? a.step : 0;
        const stepB = typeof b.step === 'number' ? b.step : 0;
        return stepA - stepB;
      });

    if (stepItems.length === 0) {
      return;
    }

    const isOrderCompleted = stepItems.every((step) => {
      if (step.isOrderCompleted === true) return true;
      return normalizeStatus(step) === 'completed';
    });

    const processingIndex = stepItems.findIndex(
      (step) => normalizeStatus(step) === 'processing'
    );
    let lastCompletedIndex = -1;
    stepItems.forEach((step, idx) => {
      if (normalizeStatus(step) === 'completed') {
        lastCompletedIndex = idx;
      }
    });

    const processedSteps = stepItems.map((step, index) => {
      const statusCode = deriveTimelineStatusCode(step, index, stepItems, {
        isDomestic,
        isInternational,
        isOrderCompleted,
        processingIndex,
        lastCompletedIndex,
      });

      const isProcessingStatus =
        statusCode === TIMELINE_STATUS_CODES.PROCESSING ||
        statusCode === TIMELINE_STATUS_CODES.INTERNATIONAL_IN_TRANSIT;
      const isScheduledStatus = statusCode === TIMELINE_STATUS_CODES.SCHEDULED;

      const shouldShowTbdDate = isProcessingStatus || isScheduledStatus;
      const displayDate = shouldShowTbdDate ? '' : step.date;
      const displayMonth = shouldShowTbdDate ? 'TBD' : undefined;
      const displayDay = shouldShowTbdDate ? '' : undefined;
      let displayTime = step.time;

      if (
        statusCode === TIMELINE_STATUS_CODES.PROCESSING ||
        statusCode === TIMELINE_STATUS_CODES.INTERNATIONAL_IN_TRANSIT
      ) {
        displayTime = 'Processing...';
      } else if (statusCode === TIMELINE_STATUS_CODES.SCHEDULED) {
        displayTime = '--:--';
      }

      return {
        ...step,
        date: displayDate,
        time: displayTime,
        monthOverride: displayMonth,
        dayOverride: displayDay,
        statusCode,
        isProcessingStatus,
        statusClass: TIMELINE_STATUS_CLASS[statusCode] || 'scheduled',
      };
    });

    const eventVisibility = evaluateDryIceEvents(shipmentData, processedSteps);
    const filteredEventItems = eventVisibility.filteredEvents;
    const dryIceEvents = filteredEventItems.filter((eventItem) => {
      const normalizedTitle = normalizeEventTitle(eventItem?.title);
      return (
        (eventItem?.eventType && eventItem.eventType.startsWith('dryice')) ||
        normalizedTitle === 'dry ice refilled' ||
        normalizedTitle === 'dry ice refilled(terminal)'
      );
    });

    // 計算進度百分比
    const progressBar = document.querySelector('.timeline-progress');
    if (progressBar) {
      const executedStatuses = [
        TIMELINE_STATUS_CODES.EXECUTED,
        TIMELINE_STATUS_CODES.ORDER_COMPLETED,
        TIMELINE_STATUS_CODES.ORDER_FINAL,
      ];
      const executedCount = processedSteps.filter((step) =>
        executedStatuses.includes(step.statusCode)
      ).length;
      const progressRatio =
        processedSteps.length === 0
          ? 0
          : Math.min(1, executedCount / processedSteps.length);
      progressBar.style.width = `${Math.round(progressRatio * 100)}%`;
    }

    const timelineVisual = resultsPanel?.querySelector('.timeline-visual');
    const timelineConnector = timelineVisual?.querySelector(
      '.timeline-connector'
    );
    if (timelineVisual) {
      const hasFinalStatus = processedSteps.some(
        (step) => step.statusCode === TIMELINE_STATUS_CODES.ORDER_FINAL
      );
      timelineVisual.classList.toggle(
        'timeline-visual--order-final',
        hasFinalStatus
      );
    }
    if (timelineVisual || timelineConnector) {
      const lastActiveIndex = processedSteps.reduce((acc, step, idx) => {
        if (step.statusCode !== TIMELINE_STATUS_CODES.SCHEDULED) {
          return idx;
        }
        return acc;
      }, -1);

      let connectorWidthPercent = 0;
      let mobileTrackHeightPercent = 0;

      if (isOrderCompleted) {
        connectorWidthPercent = 100;
        mobileTrackHeightPercent = 100;
      } else if (isDomestic && processedSteps.length === 4) {
        const domesticPreset = [0, 40, 70, 99];
        const domesticMobilePreset = [13, 42, 68, 88];
        const executedStatusCodes = new Set([
          TIMELINE_STATUS_CODES.EXECUTED,
          TIMELINE_STATUS_CODES.ORDER_COMPLETED,
          TIMELINE_STATUS_CODES.ORDER_FINAL,
        ]);

        const lastExecutedIndex = processedSteps.reduce((acc, step, idx) => {
          if (executedStatusCodes.has(step.statusCode)) {
            return idx;
          }
          return acc;
        }, -1);

        const stageIndex = Math.max(
          0,
          Math.min(lastExecutedIndex + 1, domesticPreset.length - 1)
        );
        connectorWidthPercent = domesticPreset[stageIndex];
        mobileTrackHeightPercent = domesticMobilePreset[stageIndex];
      } else if (isInternational && processedSteps.length === 7) {
        const internationalPreset = [5, 21, 37, 53, 70, 86, 97];
        const internationalMobilePreset = [5, 21, 34, 48, 63, 78, 88];
        const executedStatusCodes = new Set([
          TIMELINE_STATUS_CODES.EXECUTED,
          TIMELINE_STATUS_CODES.INTERNATIONAL_IN_TRANSIT,
        ]);
        const processingStatusCodes = new Set([
          TIMELINE_STATUS_CODES.PROCESSING,
          TIMELINE_STATUS_CODES.INTERNATIONAL_IN_TRANSIT,
        ]);

        const lastExecutedIndex = processedSteps.reduce((acc, step, idx) => {
          if (executedStatusCodes.has(step.statusCode)) {
            return idx;
          }
          return acc;
        }, -1);

        // 檢查是否有正在處理的步驟
        const processingIndex = processedSteps.findIndex((step) =>
          processingStatusCodes.has(step.statusCode)
        );

        let stageIndex;
        if (processingIndex >= 0) {
          // 如果有正在處理的步驟，顯示到該步驟的位置
          stageIndex = Math.max(
            0,
            Math.min(processingIndex, internationalPreset.length - 1)
          );
        } else {
          // 如果沒有正在處理的步驟，顯示到最後一個完成步驟的下一個位置
          stageIndex = Math.max(
            0,
            Math.min(lastExecutedIndex + 1, internationalPreset.length - 1)
          );
        }
        connectorWidthPercent = internationalPreset[stageIndex];
        mobileTrackHeightPercent = internationalMobilePreset[stageIndex];
      } else {
        const connectorRatio =
          processedSteps.length === 0
            ? 0
            : lastActiveIndex < 0
            ? 0
            : Math.min(1, (lastActiveIndex + 1) / processedSteps.length);
        connectorWidthPercent = Math.round(connectorRatio * 100);
        mobileTrackHeightPercent = connectorWidthPercent;
      }

      if (timelineConnector) {
        timelineConnector.style.setProperty(
          '--timeline-progress-width',
          `${connectorWidthPercent}%`
        );
      }
      if (timelineVisual) {
        timelineVisual.style.setProperty(
          '--timeline-progress-width',
          `${connectorWidthPercent}%`
        );
        timelineVisual.style.setProperty(
          '--timeline-progress-height',
          `${mobileTrackHeightPercent}%`
        );
      }
      const timelineTrack = timelineVisual?.querySelector('.timeline-track');
      if (timelineTrack) {
        timelineTrack.style.setProperty(
          '--timeline-progress-height',
          `${mobileTrackHeightPercent}%`
        );
      }
    }

    // 更新 timeline nodes
    let timelineNodes =
      resultsPanel?.querySelector('.timeline-nodes-container') ||
      resultsPanel?.querySelector('.timeline-nodes');

    if (!timelineNodes && timelineVisual) {
      timelineNodes = document.createElement('div');
      timelineNodes.className = 'timeline-nodes-container';
      timelineVisual.appendChild(timelineNodes);
    } else if (
      timelineNodes &&
      !timelineNodes.classList.contains('timeline-nodes-container')
    ) {
      timelineNodes.classList.add('timeline-nodes-container');
    }

    if (timelineNodes) {
      timelineNodes.innerHTML = '';
      processedSteps.forEach((item) => {
        const node = document.createElement('div');
        node.className = [
          'timeline-node',
          item.status || '',
          `timeline-node--status-${item.statusCode}`,
          `timeline-node--${item.statusClass}`,
        ]
          .filter(Boolean)
          .join(' ');
        if (item.step !== undefined) {
          node.setAttribute('data-step', item.step);
        }
        node.setAttribute('data-status-code', String(item.statusCode));
        node.setAttribute('data-status', item.statusClass);

        const { month, day } = getTimelineDateParts(item.date);
        const displayMonth = item.monthOverride ?? month;
        const displayDay = item.dayOverride ?? day;
        const displayTime = item.time || '';
        const nodeCircleClasses = ['node-circle'];
        if (item.statusCode === TIMELINE_STATUS_CODES.ORDER_FINAL) {
          nodeCircleClasses.push('node-circle--order-final');
        }
        node.innerHTML = `
        <div class="node-date" data-month="${displayMonth}" data-day="${displayDay}">
          <span class="month">${displayMonth}</span>
          <span class="separator"> </span>
          <span class="day">${displayDay}</span>
        </div>
        <div class="node-icon">
          <div class="${nodeCircleClasses.join(' ')}"></div>
        </div>
        <div class="node-info">
          <div class="node-status">${item.title || ''}</div>
          <p class="node-time">${displayTime}</p>
        </div>
      `;
        timelineNodes.appendChild(node);
      });
    }

    // 渲染 Dry Ice Events
    let timelineEvents =
      timelineVisual?.querySelector('.timeline-events') ||
      resultsPanel?.querySelector('.timeline-events');
    if (!timelineEvents && timelineVisual) {
      timelineEvents = document.createElement('div');
      timelineEvents.className = 'timeline-events';
      timelineVisual.appendChild(timelineEvents);
    }
    if (timelineEvents) {
      timelineEvents.innerHTML = '';
      if (dryIceEvents.length > 0) {
        timelineEvents.classList.remove('is-hidden');
        dryIceEvents.forEach((eventItem) => {
          const eventElement = document.createElement('div');
          eventElement.className = 'event-dryice-refilled';
          if (eventItem.eventType) {
            eventElement.dataset.eventType = eventItem.eventType;
          }
          if (eventItem.eventType === 'dryice-terminal') {
            eventElement.dataset.step = '4';
          } else if (eventItem.eventType === 'dryice-standard') {
            eventElement.dataset.step = '5';
          } else if (eventItem.step !== undefined && eventItem.step !== null) {
            eventElement.dataset.step = String(eventItem.step);
          }

          const eventCircle = document.createElement('div');
          eventCircle.className = 'event-circle';

          const eventTag = document.createElement('div');
          eventTag.className = 'event-tag';

          const eventTagText = document.createElement('span');
          eventTagText.className = 'event-tag-text';
          if (eventItem.eventType === 'dryice-terminal') {
            eventTagText.innerHTML = 'Dry Ice Refilled<br/>(Terminal)';
          } else if (eventItem.eventType === 'dryice-standard') {
            eventTagText.textContent = 'Dry Ice Refilled';
          } else {
            eventTagText.textContent = eventItem.title || '';
          }

          const eventTagIcon = document.createElement('img');
          eventTagIcon.className = 'event-tag-icon';
          eventTagIcon.src = 'images/icon-dryice.svg';
          eventTagIcon.alt = eventItem.title || 'Dry Ice Refilled';

          eventTag.append(eventTagText, eventTagIcon);
          eventElement.append(eventCircle, eventTag);
          timelineEvents.appendChild(eventElement);
        });
      } else {
        timelineEvents.classList.add('is-hidden');
      }
    }

    // 如果有 Dry Ice Event，添加時間軸圖示
    const hasDryIceEvent = dryIceEvents.length > 0;
    const primaryDryIceEvent = dryIceEvents[0];
    if (timelineVisual) {
      const existingIcon = timelineVisual.querySelector('.timeline-event-icon');
      if (!hasDryIceEvent && existingIcon) {
        existingIcon.remove();
      } else if (hasDryIceEvent && !existingIcon) {
        const icon = document.createElement('div');
        icon.className = 'timeline-event-icon';
        icon.innerHTML = `<img src="images/icon-dryice.svg" alt="${
          primaryDryIceEvent?.title || 'Dry Ice Refilled'
        }">`;
        timelineVisual.appendChild(icon);
      } else if (hasDryIceEvent && existingIcon) {
        const imgEl = existingIcon.querySelector('img');
        if (imgEl) {
          imgEl.alt = primaryDryIceEvent?.title || 'Dry Ice Refilled';
        }
      }
    }

    const statusIconWrapper = resultsPanel?.querySelector(
      '.status-icon-wrapper'
    );
    if (statusIconWrapper) {
      if (hasDryIceEvent) {
        statusIconWrapper.style.display = '';
      } else {
        statusIconWrapper.remove();
      }
    }

    // 顯示 feedback 區塊（當訂單完成時）
    const feedbackSection = resultsPanel?.querySelector('.feedback-section');
    if (feedbackSection) {
      if (isOrderCompleted) {
        feedbackSection.classList.remove('is-hidden');
      } else {
        feedbackSection.classList.add('is-hidden');
      }
    }

    // 隱藏 results-note（當訂單完成時，即 Shipment Delivered 已完成）
    const resultsNote = resultsPanel?.querySelector('.results-note');
    if (resultsNote) {
      if (isOrderCompleted) {
        resultsNote.classList.add('is-hidden');
      } else {
        resultsNote.classList.remove('is-hidden');
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

    if (!orderNo) {
      orderInput.setCustomValidity('Please enter Job No.');
      orderInput.reportValidity();
      return;
    }

    if (!trackingNo) {
      jobInput.setCustomValidity('Please enter Tracking No.');
      jobInput.reportValidity();
      return;
    }

    orderInput.setCustomValidity('');
    jobInput.setCustomValidity('');

    // 顯示載入狀態
    showLoading();
    scrollToResultsPanel();

    const [result] = await Promise.all([
      fetchTrackingData(orderNo, trackingNo),
      wait(MIN_LOADING_TIME),
    ]);

    // 處理結果
    if (result === 'error') {
      showError(STATUS_MESSAGES.error);
      return;
    }

    // 處理查詢次數限制（429 錯誤）
    if (result && result.error === 'rate_limit') {
      showResultsMessage(
        'error',
        result.message || STATUS_MESSAGES.error,
        'rate_limit'
      );
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
    renderTimeline(result);
    updateApiDebugPanel(result);

    // 更新 URL (不刷新頁面)，保留 apiKey 參數
    const url = new URL(window.location);
    url.searchParams.set('order', orderNo);
    url.searchParams.set('tracking', trackingNo);
    // 如果 URL 中有 apiKey，保留它
    const apiKey = getApiKey();
    if (apiKey) {
      url.searchParams.set('apiKey', apiKey);
    }
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

    // 如果 URL 中有 order 和 tracking 參數，自動觸發查詢
    if (orderNo && trackingNo) {
      // 延遲執行，確保 DOM 已完全載入
      setTimeout(() => {
        // 創建一個模擬的 event 對象
        const mockEvent = {
          preventDefault: () => {},
        };
        handleFormSubmit(mockEvent);
      }, 100);
    }
  }

  // 初始化
  document.addEventListener('DOMContentLoaded', () => {
    // 追蹤頁面載入
    trackUsage('page_load', {
      url: window.location.href,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
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

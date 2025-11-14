(function () {
  // TailorMed 貨件追蹤系統 - API 整合

  // API 設定（從 config.js 讀取，如果沒有則使用預設值）
  const API_BASE_URL =
    window.CONFIG?.API_BASE_URL || 'http://localhost:3000/api';

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
            url: window.location.href,
          }),
        }).catch(() => {}); // 靜默處理錯誤，不影響主要功能
      }, 0);
    } catch (error) {
      // 靜默處理，不影響主要功能
    }
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
      orderInput.setCustomValidity('Please enter Order No.');
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

  function showResultsMessage(type, message) {
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
        illustration = `
        <div class="results-message__illustration">
          <img src="images/noData.svg" alt="No data found illustration">
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

  // 查詢貨件資料
  async function fetchTrackingData(orderNo, trackingNo) {
    // 追蹤查詢嘗試
    trackUsage('query_attempt', { orderNo, trackingNo });

    const startTime = Date.now();

    try {
      const controller =
        typeof AbortController !== 'undefined' ? new AbortController() : null;
      let timeoutId = null;

      if (controller) {
        timeoutId = setTimeout(() => controller.abort(), MAX_QUERY_TIME);
      }

      // 使用 POST 方法呼叫 API（Netlify Functions 支援 POST）
      const response = await fetch(`${API_BASE_URL}/tracking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderNo: orderNo,
          trackingNo: trackingNo,
        }),
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
    const lastUpdateText =
      combinedTimelineDateTime || shipmentData.lastUpdate || '—';

    const etaFormatted = formatDateToDDMMYYYY(shipmentData.eta);

    // 更新基本資訊
    const summaryFields = {
      'Order No.': shipmentData.orderNo || '—',
      'Original/Destination': (() => {
        if (
          shipmentData.originDestination &&
          shipmentData.originDestination.trim()
        ) {
          return shipmentData.originDestination;
        }
        if (shipmentData.origin && shipmentData.destination) {
          return `${shipmentData.origin} → ${shipmentData.destination}`;
        }
        return shipmentData.route || '—';
      })(),
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

    if (!isInternational) {
      return {
        shouldShowEventOne: false,
        shouldShowEventTwo: false,
        filteredEvents: events,
        hasAnyEvent: events.length > 0,
      };
    }

    const normalizeTitle = (value) =>
      (value || '').toString().replace(/\s+/g, ' ').trim().toLowerCase();

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

    const statusLetters = stepsSource.map((item) => item.letter);

    const matchesInternationalPattern =
      statusLetters.length >= 7 &&
      statusLetters.slice(0, 5).every((letter) => letter === 'a') &&
      statusLetters.slice(5, 7).every((letter) => letter === 'd');

    const getLetterByTitle = (title) => {
      const normalized = normalizeTitle(title);
      const found = stepsSource.find(
        (item) => normalizeTitle(item.title) === normalized
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
      matchesInternationalPattern && terminalChecked && inTransitLetter === 'a';

    const shouldShowEventTwo =
      matchesInternationalPattern && dryIceChecked && destCustomsLetter === 'a';

    const filteredEvents = events.filter((eventItem) => {
      const titleNormalized = normalizeTitle(eventItem.title);
      if (titleNormalized === 'dry ice refilled(terminal)') {
        return shouldShowEventOne;
      }
      if (titleNormalized === 'dry ice refilled') {
        return shouldShowEventTwo;
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

      const displayDate = isProcessingStatus ? '' : step.date;
      const displayMonth = isProcessingStatus ? 'TBD' : undefined;
      const displayDay = isProcessingStatus ? '' : undefined;
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

      if (isDomestic && processedSteps.length === 4) {
        const domesticPreset = [0, 40, 70, 99];
        const domesticMobilePreset = [13, 38, 66, 88];
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
        const internationalPreset = [5, 21, 38, 53, 68, 85, 97];
        const internationalMobilePreset = [5, 21, 34, 48, 63, 78, 88];
        const executedStatusCodes = new Set([
          TIMELINE_STATUS_CODES.EXECUTED,
          TIMELINE_STATUS_CODES.INTERNATIONAL_IN_TRANSIT,
        ]);

        const lastExecutedIndex = processedSteps.reduce((acc, step, idx) => {
          if (executedStatusCodes.has(step.statusCode)) {
            return idx;
          }
          return acc;
        }, -1);

        const stageIndex = Math.max(
          0,
          Math.min(lastExecutedIndex + 1, internationalPreset.length - 1)
        );
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
        node.innerHTML = `
        <div class="node-date" data-month="${displayMonth}" data-day="${displayDay}">
          <span class="month">${displayMonth}</span>
          <span class="separator"> </span>
          <span class="day">${displayDay}</span>
        </div>
        <div class="node-icon">
          <div class="node-circle"></div>
        </div>
        <div class="node-info">
          <div class="node-status">${item.title || ''}</div>
          <p class="node-time">${displayTime}</p>
        </div>
      `;
        timelineNodes.appendChild(node);
      });
    }

    // 如果有 Dry Ice Event，添加時間軸圖示
    const dryIceEvent = filteredEventItems.find(
      (item) => item.eventType === 'dryice'
    );
    if (timelineVisual) {
      const existingIcon = timelineVisual.querySelector('.timeline-event-icon');
      if (!dryIceEvent && existingIcon) {
        existingIcon.remove();
      } else if (dryIceEvent && !existingIcon) {
        const icon = document.createElement('div');
        icon.className = 'timeline-event-icon';
        icon.innerHTML =
          '<img src="images/icon-dryice.svg" alt="Dry Ice Refilled">';
        timelineVisual.appendChild(icon);
      }
    }

    const statusIconWrapper = resultsPanel?.querySelector(
      '.status-icon-wrapper'
    );
    if (statusIconWrapper) {
      if (dryIceEvent) {
        statusIconWrapper.style.display = '';
      } else {
        statusIconWrapper.remove();
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
      orderInput.setCustomValidity('Please enter Order No.');
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
    renderTimeline(result);
    updateApiDebugPanel(result);

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

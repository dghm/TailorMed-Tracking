// Airtable 資料庫連接配置

// 載入環境變數（從 backend 目錄的 .env 檔案，或從 repository root）
(function loadEnvVars() {
  const path = require('path');
  const fs = require('fs');

  const envPaths = [
    path.resolve(__dirname, '../../../../../.env'), // repository root/.env (優先，Netlify dev 會自動載入)
    path.resolve(__dirname, '../.env'), // backend/.env (備用)
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
      console.log('✅ Airtable module: 已載入 .env 檔案:', envPath);
      return;
    }
  }

  console.log('⚠️ Airtable module: 未找到 .env 檔案');
})();

const Airtable = require('airtable');

let base = null;

/**
 * 初始化 Airtable 連接
 */
function initAirtable() {
  if (!base) {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;

    if (!apiKey || !baseId) {
      throw new Error('Airtable API Key 和 Base ID 必須設定在環境變數中');
    }

    base = new Airtable({ apiKey }).base(baseId);
    console.log('✅ 已連接到 Airtable Base:', baseId);
  }

  return base;
}

/**
 * 格式化日期為 YYYY-MM-DD（台灣時間 UTC+8）
 * @param {Date|string} dateInput - 日期時間
 * @returns {string} 格式化後的日期字符串
 */
function formatDateTaiwan(dateInput) {
  if (!dateInput) return '';
  
  let date;
  if (dateInput instanceof Date) {
    date = new Date(dateInput);
  } else {
    date = new Date(dateInput);
  }
  
  if (isNaN(date.getTime())) return '';
  
  // 使用 Intl.DateTimeFormat 格式化為台灣時區
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  
  return `${year}-${month}-${day}`;
}

/**
 * 格式化時間為 HH:MM（台灣時間 UTC+8）
 * @param {Date|string} dateInput - 日期時間
 * @returns {string} 格式化後的時間字符串
 */
function formatTimeTaiwan(dateInput) {
  if (!dateInput) return '';
  
  let date;
  if (dateInput instanceof Date) {
    date = new Date(dateInput);
  } else {
    date = new Date(dateInput);
  }
  
  if (isNaN(date.getTime())) return '';
  
  // 使用 Intl.DateTimeFormat 格式化為台灣時區
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const hours = parts.find(p => p.type === 'hour').value;
  const minutes = parts.find(p => p.type === 'minute').value;
  
  return `${hours}:${minutes}`;
}

/**
 * 查詢貨件資料
 * @param {string} orderNo - Job No.
 * @param {string} trackingNo - Tracking No.
 * @returns {Promise<Object|null>} 貨件資料
 */
async function findShipment(orderNo, trackingNo) {
  try {
    const airtableBase = initAirtable();
    const tableName = process.env.AIRTABLE_SHIPMENTS_TABLE || 'Shipments';

    // 查詢 Airtable - 嘗試多種欄位名稱組合
    let records = [];
    const fieldNameCombinations = [
      ['Job No.', 'Tracking No.'], // 注意：實際欄位名稱有句點
      ['Job No', 'Tracking No'],
      ['JobNo', 'TrackingNo'],
      ['Order No', 'Tracking No'],
      ['OrderNo', 'TrackingNo'],
      ['job_no', 'tracking_no'],
      ['jobNo', 'trackingNo'],
      ['Job Number', 'Tracking Number'],
      ['Job Number', 'Tracking No'],
    ];

    for (const [jobField, trackingField] of fieldNameCombinations) {
      try {
        records = await airtableBase(tableName)
          .select({
            filterByFormula: `AND({${jobField}} = "${orderNo.toUpperCase()}", {${trackingField}} = "${trackingNo.toUpperCase()}")`,
            maxRecords: 1,
          })
          .firstPage();

        if (records.length > 0) {
          console.log(`✅ 使用欄位名稱: ${jobField}, ${trackingField}`);
          break;
        }
      } catch (error) {
        // 繼續嘗試下一個組合
        continue;
      }
    }

    if (records.length === 0) {
      return null;
    }

    const record = records[0];
    const fields = record.fields;

    // 輔助函數：取得欄位值（處理陣列情況）
    const getFieldValue = (fieldNames, defaultValue = '') => {
      for (const fieldName of fieldNames) {
        const value = fields[fieldName];
        if (value !== undefined && value !== null) {
          // 如果是陣列，取第一個值；否則直接返回
          return Array.isArray(value) ? value[0] : value;
        }
      }
      return defaultValue;
    };

    // 轉換為統一格式
    return {
      id: record.id,
      orderNo: getFieldValue(
        ['Job No.', 'Job No', 'Order No', 'JobNo'],
        orderNo
      ),
      trackingNo: getFieldValue(
        ['Tracking No.', 'Tracking No', 'TrackingNo'],
        trackingNo
      ),
      status: getFieldValue(['Status', 'status'], 'pending'),
      // 處理 Origin/Destination 欄位（格式：TPE → PVG）
      origin: (() => {
        const originDest = getFieldValue(
          ['Origin/Destination', 'Origin', 'origin'],
          ''
        );
        if (originDest && originDest.includes('→')) {
          return originDest.split('→')[0].trim();
        }
        return getFieldValue(['Origin', 'origin'], '');
      })(),
      destination: (() => {
        const originDest = getFieldValue(
          ['Origin/Destination', 'Destination', 'destination'],
          ''
        );
        if (originDest && originDest.includes('→')) {
          return originDest.split('→')[1].trim();
        }
        return getFieldValue(['Destination', 'destination'], '');
      })(),
      packageCount: getFieldValue(
        ['Package Count', 'PackageCount', 'Packages'],
        1
      ),
      weight: getFieldValue(['Weight(KG)', 'Weight', 'weight'], ''),
      eta: getFieldValue(['ETA', 'eta', 'Estimated Arrival'], ''),
      invoiceNo: getFieldValue(
        ['Invoice No.', 'Invoice No', 'InvoiceNo', 'Invoice'],
        ''
      ),
      lastUpdate: getFieldValue(
        [
          'Lastest Update',
          'Last Update',
          'LastUpdate',
          'Updated',
          'Updated At',
        ],
        ''
      ),
      mawb: getFieldValue(['MAWB', 'mawb'], ''),
      // 處理 Transport Type 欄位（可能是陣列）
      transportType: (() => {
        const transportTypeValue = getFieldValue(
          ['Transport Type', 'TransportType', 'transportType'],
          ''
        );
        // 如果是陣列，取第一個值；如果是字串，直接返回
        if (Array.isArray(transportTypeValue)) {
          return transportTypeValue[0] || '';
        }
        return transportTypeValue || '';
      })(),
      // 保留原始欄位以便後續使用（包含日期欄位）
      _raw: fields,
    };
  } catch (error) {
    console.error('Airtable query error:', error);
    throw error;
  }
}

/**
 * 查詢時間軸資料
 * @param {string} trackingNo - Tracking No.
 * @param {Object} shipmentFields - 從 Tracking 表格取得的原始欄位（用於生成 timeline）
 * @returns {Promise<Array>} 時間軸資料
 */
async function findTimeline(trackingNo, shipmentFields = null) {
  try {
    const airtableBase = initAirtable();
    const tableName = process.env.AIRTABLE_TIMELINE_TABLE || 'Timeline';

    // 首先嘗試查詢獨立的 Timeline 表格
    try {
      const records = await airtableBase(tableName)
        .select({
          filterByFormula: `OR({Tracking No.} = "${trackingNo.toUpperCase()}", {Tracking No} = "${trackingNo.toUpperCase()}")`,
          sort: [
            { field: 'Date', direction: 'asc' },
            { field: 'Time', direction: 'asc' },
          ],
        })
        .all();

      if (records.length > 0) {
        // 轉換為統一格式
        return records.map((record) => {
          const fields = record.fields;

          return {
            id: record.id,
            trackingNo:
              fields['Tracking No.'] ||
              fields['Tracking No'] ||
              fields['TrackingNo'] ||
              trackingNo,
            step:
              fields['Step'] ||
              fields['step'] ||
              (fields['Step Number'] ? parseInt(fields['Step Number']) : null),
            title:
              fields['Title'] ||
              fields['title'] ||
              fields['Status'] ||
              fields['status'] ||
              '',
            date: fields['Date'] || fields['date'] || '',
            time: fields['Time'] || fields['time'] || '',
            status: fields['Status'] || fields['status'] || 'pending',
            isEvent:
              fields['Is Event'] ||
              fields['IsEvent'] ||
              fields['Event'] ||
              false,
            createdAt:
              fields['Created At'] || fields['CreatedAt'] || new Date(),
          };
        });
      }
    } catch (error) {
      // Timeline 表格不存在或查詢失敗，繼續使用 Tracking 表格的日期欄位
      console.log(
        '⚠️ Timeline 表格不存在或查詢失敗，使用 Tracking 表格的日期欄位'
      );
    }

    // 如果 Timeline 表格沒有資料，從 Tracking 表格的日期欄位生成 timeline
    if (shipmentFields) {
      const timeline = [];

      // 檢查 Transport Type
      const getFieldValue = (fieldNames, defaultValue = null) => {
        for (const name of Array.isArray(fieldNames)
          ? fieldNames
          : [fieldNames]) {
          const value = shipmentFields[name];
          if (value !== undefined && value !== null && value !== '') {
            return value;
          }
        }
        return defaultValue;
      };

      const transportTypeValue = getFieldValue(
        ['Transport Type', 'TransportType', 'transportType'],
        ''
      );
      const transportType = Array.isArray(transportTypeValue)
        ? transportTypeValue[0] || ''
        : transportTypeValue || '';
      const isDomestic = transportType.toLowerCase() === 'domestic';

      // 根據 Transport Type 決定使用哪個 timelineConfig
      let timelineConfig;

      if (isDomestic) {
        // Domestic：只處理 4 個步驟，不處理事件
        timelineConfig = [
          { title: 'Order Created', isEvent: false },
          { title: 'Shipment Collected', isEvent: false },
          { title: 'In Transit', isEvent: false },
          { title: 'Shipment Delivered', isEvent: false },
        ];
      } else {
        // Export/Import/Cross：處理 7 個步驟 + 2 個事件
        // 順序：7 個步驟 + 2 個事件
        // 1. Order Created
        // 2. Shipment Collected
        // 3. Origin Customs Process
        // 4. In Transit
        // e1. Dry Ice Refilled(Terminal) - 事件
        // 5. Destination Customs Process
        // e2. Dry Ice Refilled - 事件
        // 6. Out for Delivery
        // 7. Shipment Delivered
        timelineConfig = [
          { title: 'Order Created', isEvent: false },
          { title: 'Shipment Collected', isEvent: false },
          { title: 'Origin Customs Process', isEvent: false },
          { title: 'In Transit', isEvent: false },
          {
            title: 'Dry Ice Refilled(Terminal)',
            isEvent: true,
            fieldName: 'Dry Ice Refilled(Terminal)',
          },
          {
            title: 'Destination Customs Process',
            isEvent: false,
            fieldName: 'Destination Customs Process',
          },
          {
            title: 'Dry Ice Refilled',
            isEvent: true,
            fieldName: 'Dry Ice Refilled',
          },
          { title: 'Out for Delivery', isEvent: false },
          { title: 'Shipment Delivered', isEvent: false },
        ];
      }

      let stepCounter = 1;
      let lastCompletedStepIndex = -1; // 記錄最後一個已完成的步驟在 timelineConfig 中的索引（排除 Processing 之後的步驟）
      let processingStepIndex = -1; // 記錄 Processing 狀態的步驟索引

      // 用於存儲每個步驟的最終狀態（用於事件判斷前置條件）
      const stepStatusMap = new Map(); // key: index, value: 'completed' | 'processing' | 'pending'

      // 第一輪：找出最後一個有資料的步驟（排除事件）
      // 邏輯：節點有資料的狀態為 Complete，有資料的最後一個節點的下一個為 Processing...
      // 注意：需要先找出最後一個有資料的步驟，然後判斷下一個是否為 processing
      // 但 Processing 之後的步驟即使有資料，也不應該被計入最後一個有資料的步驟

      // 先找出所有有資料的步驟索引（按順序）
      const completedStepIndices = [];
      timelineConfig.forEach((config, index) => {
        if (!config.isEvent) {
          const fieldName = config.fieldName || config.title;
          const fieldValue = shipmentFields[fieldName];
          const dateValue = fieldValue;
          const date = dateValue ? new Date(dateValue) : null;
          const isCompleted = dateValue && !isNaN(date?.getTime());

          if (isCompleted) {
            completedStepIndices.push(index);
          }
        }
      });

      // 如果沒有已完成的步驟，lastCompletedStepIndex 保持為 -1
      if (completedStepIndices.length > 0) {
        lastCompletedStepIndex =
          completedStepIndices[completedStepIndices.length - 1];
      }

      // 第二輪：先處理所有步驟（非事件），建立狀態映射
      // 這樣可以讓事件在判斷前置條件時，知道對應步驟的最終狀態
      timelineConfig.forEach((config, index) => {
        if (!config.isEvent) {
          const fieldName = config.fieldName || config.title;
          const fieldValue = shipmentFields[fieldName];
          const dateValue = fieldValue;
          const date = dateValue ? new Date(dateValue) : null;
          const isCompleted = dateValue && !isNaN(date?.getTime());

          // 判斷狀態邏輯：
          // 1. 節點有資料的狀態為 Complete
          // 2. 有資料的最後一個節點的下一個為 Processing...
          // 3. 後續沒有資料或有資料都該為 Pending...

          let finalStatus = 'pending';

          // 如果當前步驟有資料，且不在 Processing 之後，狀態為 completed
          if (isCompleted) {
            finalStatus = 'completed';
            // 更新最後一個有資料的步驟索引（如果這個步驟在當前 processingStepIndex 之前）
            if (processingStepIndex < 0 || index < processingStepIndex) {
              lastCompletedStepIndex = index;
            }
          } else {
            // 如果當前步驟沒有資料，判斷是否為 processing
            // 只有當它是最後一個有資料的步驟的下一個步驟時，才為 processing
            if (lastCompletedStepIndex >= 0) {
              // 檢查當前 index 是否緊接在最後一個已完成步驟之後（跳過事件）
              // 事件不應該影響下一個步驟的處理中狀態
              let isNextStep = true;
              for (let i = lastCompletedStepIndex + 1; i < index; i++) {
                const prevConfig = timelineConfig[i];
                // 如果是事件，忽略它（事件不影響下一個步驟的處理中狀態）
                if (prevConfig.isEvent) {
                  // 事件不影響判斷，繼續檢查下一個
                  continue;
                } else {
                  // 如果是非事件步驟，則當前不是下一個步驟
                  isNextStep = false;
                  break;
                }
              }
              if (isNextStep) {
                finalStatus = 'processing';
                processingStepIndex = index; // 記錄 Processing 步驟的索引
              }
            }
          }

          // 最終規則：如果當前步驟在 Processing 步驟之後，無論是否有資料，都強制為 pending
          // 因為 Processing 節點正在處理中，理論上後續都未發生
          if (
            processingStepIndex >= 0 &&
            index > processingStepIndex &&
            !config.isEvent
          ) {
            finalStatus = 'pending';
          }

          // 記錄步驟的最終狀態，用於事件判斷前置條件
          stepStatusMap.set(index, finalStatus);
        }
      });

      // 第三輪：建立 timeline 項目（包含步驟和事件）
      timelineConfig.forEach((config, index) => {
        const fieldName = config.fieldName || config.title;
        const fieldValue = shipmentFields[fieldName];

        // 對於事件，需要特殊處理
        if (config.isEvent) {
          // 檢查 checkbox 欄位：只有當 checkbox 為 true 時才顯示事件
          const isChecked = fieldValue === true || fieldValue === 'true';

          // 如果沒有被打勾，跳過這個事件
          if (!isChecked) {
            return; // Skip this event
          }

          // 事件顯示規則：
          // 1. Dry Ice Refilled(Terminal) 必須在 In Transit 狀態為 completed 後才顯示
          // 2. Dry Ice Refilled 必須在 Destination Customs Process 狀態為 completed 後才顯示
          // 注意：即使欄位有資料，如果步驟狀態為 pending（例如因為前面的步驟不完整），事件也不應該顯示
          let prerequisiteMet = false;

          if (config.title === 'Dry Ice Refilled(Terminal)') {
            // 檢查 In Transit 的狀態是否為 completed
            // 找到 In Transit 在 timelineConfig 中的索引
            const inTransitIndex = timelineConfig.findIndex(
              (c) =>
                !c.isEvent &&
                (c.title === 'In Transit' || c.fieldName === 'In Transit')
            );
            if (inTransitIndex >= 0) {
              const inTransitStatus = stepStatusMap.get(inTransitIndex);
              prerequisiteMet = inTransitStatus === 'completed';
            }
          } else if (config.title === 'Dry Ice Refilled') {
            // 檢查 Destination Customs Process 的狀態是否為 completed
            // 找到 Destination Customs Process 在 timelineConfig 中的索引
            const destCustomsIndex = timelineConfig.findIndex(
              (c) =>
                !c.isEvent &&
                (c.title === 'Destination Customs Process' ||
                  c.fieldName === 'Destination Customs Process')
            );
            if (destCustomsIndex >= 0) {
              const destCustomsStatus = stepStatusMap.get(destCustomsIndex);
              prerequisiteMet = destCustomsStatus === 'completed';
            }
          } else {
            // 其他事件，預設顯示
            prerequisiteMet = true;
          }

          // 如果前置條件未滿足，跳過這個事件
          if (!prerequisiteMet) {
            return; // Skip this event
          }

          // 嘗試從多個可能的日期欄位取得日期
          // 1. 檢查是否有對應的日期欄位（例如 "Dry Ice Refilled(Terminal) Date"）
          // 2. 檢查 fieldValue 本身是否為日期
          // 3. 如果都沒有，使用 Last Modified Time 或 Lastest Update 作為打勾時間
          let date = null;

          // 嘗試從 fieldValue 本身解析日期
          if (
            fieldValue &&
            typeof fieldValue === 'object' &&
            fieldValue instanceof Date
          ) {
            date = fieldValue;
          } else if (
            typeof fieldValue === 'string' &&
            fieldValue.match(/^\d{4}-\d{2}-\d{2}/)
          ) {
            date = new Date(fieldValue);
          } else {
            // 嘗試查找對應的日期欄位（例如 "Dry Ice Refilled(Terminal) Date"）
            const dateFieldName = `${fieldName} Date`;
            const dateFieldValue = shipmentFields[dateFieldName];
            if (dateFieldValue) {
              const parsedDate =
                typeof dateFieldValue === 'string'
                  ? new Date(dateFieldValue)
                  : dateFieldValue instanceof Date
                  ? dateFieldValue
                  : null;
              if (parsedDate && !isNaN(parsedDate.getTime())) {
                date = parsedDate;
              }
            }
          }

          // 如果還是沒有日期，使用 Last Modified Time 或 Lastest Update 作為打勾時間
          if (!date || isNaN(date.getTime())) {
            const lastModified =
              shipmentFields['Last Modified Time'] ||
              shipmentFields['Lastest Update'] ||
              shipmentFields['Last Update'] ||
              shipmentFields['Updated At'];
            if (lastModified) {
              const parsedDate =
                typeof lastModified === 'string'
                  ? new Date(lastModified)
                  : lastModified instanceof Date
                  ? lastModified
                  : null;
              if (parsedDate && !isNaN(parsedDate.getTime())) {
                date = parsedDate;
              }
            }
          }

          // 如果還是沒有日期，使用當前時間作為打勾時間
          if (!date || isNaN(date.getTime())) {
            date = new Date();
          }

          const hasDate = date && !isNaN(date.getTime());
          const isCompleted = hasDate;

          timeline.push({
            title: config.title,
            date: hasDate ? formatDateTaiwan(date) : '',
            time: hasDate ? formatTimeTaiwan(date) : '',
            status: isCompleted ? 'completed' : 'pending',
            isEvent: true,
            eventType: 'dryice',
            step: null, // 事件不顯示步驟編號
          });
        } else {
          // 普通步驟：從第二輪建立的狀態映射中取得最終狀態
          const dateValue = fieldValue;
          const date = dateValue ? new Date(dateValue) : null;
          const isCompleted = dateValue && !isNaN(date?.getTime());
          const finalStatus = stepStatusMap.get(index) || 'pending';

          timeline.push({
            title: config.title,
            date: isCompleted ? formatDateTaiwan(date) : '',
            time: isCompleted ? formatTimeTaiwan(date) : '',
            status: finalStatus,
            step: stepCounter++,
            isEvent: false,
          });
        }
      });

      // 檢查訂單是否完成：所有步驟都有日期時間資料，且最後一個步驟「Shipment Delivered」有資料
      let isOrderCompleted = false;

      // 對於 Domestic，只檢查 4 個步驟；對於 Export/Import/Cross，檢查所有步驟（排除事件）
      const stepsToCheck = timelineConfig.filter((config) => !config.isEvent);
      const allStepsHaveData = stepsToCheck.every((config) => {
        const fieldName = config.fieldName || config.title;
        const fieldValue = shipmentFields[fieldName];
        const dateValue = fieldValue;
        const date = dateValue ? new Date(dateValue) : null;
        return dateValue && !isNaN(date?.getTime());
      });

      // 檢查最後一個步驟「Shipment Delivered」是否有資料
      const shipmentDeliveredConfig = timelineConfig.find(
        (c) => !c.isEvent && c.title === 'Shipment Delivered'
      );
      let shipmentDeliveredHasData = false;
      if (shipmentDeliveredConfig) {
        const fieldName =
          shipmentDeliveredConfig.fieldName || shipmentDeliveredConfig.title;
        const fieldValue = shipmentFields[fieldName];
        const dateValue = fieldValue;
        const date = dateValue ? new Date(dateValue) : null;
        shipmentDeliveredHasData = dateValue && !isNaN(date?.getTime());
      }

      // 如果所有步驟都有資料，且 Shipment Delivered 有資料，則訂單完成
      isOrderCompleted = allStepsHaveData && shipmentDeliveredHasData;

      // 如果訂單完成，將所有步驟的狀態標記為 'completed'（用於前端樣式）
      if (isOrderCompleted) {
        timeline.forEach((item) => {
          if (!item.isEvent) {
            item.status = 'completed';
            item.isOrderCompleted = true; // 標記為訂單完成狀態
          }
        });
      }

      // 保持 Airtable 表格中欄位的實際順序，不按日期時間排序
      // 這樣可以確保 timeline 按照 Airtable 表格中欄位的順序顯示
      return timeline;
    }

    return [];
  } catch (error) {
    console.error('Airtable timeline query error:', error);
    return [];
  }
}

/**
 * 測試 Airtable 連接
 */
async function testConnection() {
  try {
    const airtableBase = initAirtable();
    const tableName = process.env.AIRTABLE_SHIPMENTS_TABLE || 'Shipments';

    // 嘗試讀取一筆記錄
    const records = await airtableBase(tableName)
      .select({ maxRecords: 1 })
      .firstPage();

    console.log('✅ Airtable 連接成功');
    console.log(`✅ 找到 ${records.length} 筆記錄（測試用）`);

    return true;
  } catch (error) {
    console.error('❌ Airtable 連接失敗:', error.message);
    return false;
  }
}

module.exports = {
  initAirtable,
  findShipment,
  findTimeline,
  testConnection,
};

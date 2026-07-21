/**
 * Netlify Function for tracking API
 * Version: 1.0.0 (正式版)
 *
 * 功能：
 * - 處理 /api/tracking, /api/tracking-public, /api/health 等請求
 * - 支援 GET 和 POST 方法
 * - 連接 Airtable 資料庫查詢貨件資訊
 * - IP 頻率限制（每分鐘 3 次，每小時 10 次）
 * - 錯誤處理與回應格式化
 */

// 本地開發時使用資料庫連接
let dbConnection = null;
let airtableConnection = null;

// 載入 Rate Limiter
const { checkRateLimit } = require('./rateLimiter');
// 載入 API Key 驗證器
const { validateApiKey, extractApiKey } = require('./apiKeyValidator');
const Airtable = require('airtable');

let logBase = null;

// 一般診斷訊息僅在 DEBUG=true 時輸出，避免雜訊與機敏資訊外洩到 Netlify Function logs
const DEBUG = process.env.DEBUG === 'true';
function debugLog(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

function initLogBase() {
  if (!logBase) {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    if (!apiKey || !baseId) {
      throw new Error('Missing Airtable API Key/Base ID for logging');
    }
    logBase = new Airtable({ apiKey }).base(baseId);
  }
  return logBase;
}

async function logTrackingRequest(logData) {
  if (process.env.ENABLE_TRACKING_LOGS === 'false') return;
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) return;

  const tableName = process.env.AIRTABLE_LOGS_TABLE || 'TrackingLogs';
  try {
    const base = initLogBase();
    await base(tableName).create([
      {
        fields: {
          Timestamp: logData.Timestamp,
          OrderNo: logData.OrderNo || '',
          TrackingNo: logData.TrackingNo || '',
          StatusCode: String(logData.StatusCode || ''),
          Success: String(logData.Success ?? ''),
          ErrorType: logData.ErrorType || '',
          ErrorMessage: logData.ErrorMessage || '',
          ResponseTimeMs: String(logData.ResponseTimeMs || ''),
          ClientIP: logData.ClientIP || '',
          UserAgent: logData.UserAgent || '',
          ApiKeyUsed: String(logData.ApiKeyUsed ?? ''),
          ApiKeyValid: String(logData.ApiKeyValid ?? ''),
          Method: logData.Method || '',
          Path: logData.Path || '',
        },
      },
    ]);
  } catch (error) {
    console.warn('⚠️ TrackingLog write failed:', error.message);
  }
}

async function logAndReturn(response, logData) {
  try {
    await logTrackingRequest(logData);
  } catch (error) {
    // Logging should never block responses
  }
  return response;
}

// 獲取客戶端 IP 地址
function getClientIP(event) {
  // Netlify 會將真實 IP 放在這些 header 中
  const headers = event.headers || {};

  // 優先順序：x-forwarded-for > x-client-ip > client-ip > 直接從 event
  const ip =
    headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    headers['x-client-ip'] ||
    headers['client-ip'] ||
    event.requestContext?.identity?.sourceIp ||
    'unknown';

  return ip;
}

// 載入環境變數的函數
function loadEnvVars() {
  const path = require('path');
  const fs = require('fs');

  // 嘗試從多個位置載入 .env
  // Netlify dev 會自動從 repository root 載入 .env，但我們也要支援 backend/.env
  // 從 netlify/functions/tracking.js 到 repository root 需要上溯 6 層
  const envPaths = [
    path.resolve(__dirname, '../../../../../../.env'), // repository root/.env (優先，Netlify dev 會自動載入)
    path.resolve(__dirname, '../../.env'), // backend/.env (備用)
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
      debugLog('✅ 已載入 .env 檔案:', envPath);
      debugLog(
        '✅ AIRTABLE_API_KEY:',
        process.env.AIRTABLE_API_KEY ? 'SET' : 'NOT SET'
      );
      debugLog(
        '✅ AIRTABLE_BASE_ID:',
        process.env.AIRTABLE_BASE_ID || 'NOT SET'
      );
      return;
    }
  }

  debugLog('⚠️ 未找到 .env 檔案，嘗試的路徑:', envPaths);
}

// 初始化連接模組
function initConnections() {
  // 載入環境變數
  loadEnvVars();

  debugLog('🔧 initConnections() - 環境變數狀態:');
  debugLog(
    '  AIRTABLE_API_KEY:',
    process.env.AIRTABLE_API_KEY ? 'SET' : 'NOT SET'
  );
  debugLog('  AIRTABLE_BASE_ID:', process.env.AIRTABLE_BASE_ID || 'NOT SET');
  debugLog('  BACKEND_API_URL:', process.env.BACKEND_API_URL || 'NOT SET');

  // 優先使用 Airtable（如果已設定）
  if (
    process.env.AIRTABLE_API_KEY &&
    process.env.AIRTABLE_BASE_ID &&
    !process.env.BACKEND_API_URL
  ) {
    try {
      // 在 Netlify Function 環境中，優先使用同目錄下的 database 模組
      // 如果不存在，則嘗試使用相對路徑
      const path = require('path');
      const fs = require('fs');

      // 在 Netlify 部署環境中，直接使用相對路徑 require
      // airtable.js 應該在同一個目錄下
      try {
        // 先嘗試直接 require（最簡單的方式）
        airtableConnection = require('./airtable');
        debugLog('✅ 已載入 Airtable 連接模組（直接 require）');
      } catch (requireError) {
        // 如果直接 require 失敗，嘗試使用完整路徑
        debugLog(
          '⚠️ 直接 require 失敗，嘗試使用完整路徑:',
          requireError.message
        );
        const localPath = path.join(__dirname, 'airtable.js');
        const fallbackPath = path.resolve(
          __dirname,
          '../../../database/airtable.js'
        );

        if (fs.existsSync(localPath)) {
          // 清除緩存
          if (require.cache[localPath]) {
            delete require.cache[localPath];
          }
          airtableConnection = require(localPath);
          debugLog(
            '✅ 已載入 Airtable 連接模組（使用完整路徑）:',
            localPath
          );
        } else if (fs.existsSync(fallbackPath)) {
          if (require.cache[fallbackPath]) {
            delete require.cache[fallbackPath];
          }
          airtableConnection = require(fallbackPath);
          debugLog(
            '✅ 已載入 Airtable 連接模組（使用備用路徑）:',
            fallbackPath
          );
        } else {
          console.error('❌ 無法找到 airtable 模組，嘗試的路徑:');
          console.error('  - ./airtable (相對路徑)');
          console.error('  -', localPath);
          console.error('  -', fallbackPath);
          console.error('  - __dirname:', __dirname);
          throw new Error(
            `Cannot find airtable module. Checked: ./airtable, ${localPath}, ${fallbackPath}`
          );
        }
      }
      debugLog('✅ 已載入 Airtable 連接模組');
      debugLog(
        '✅ AIRTABLE_SHIPMENTS_TABLE:',
        process.env.AIRTABLE_SHIPMENTS_TABLE || 'NOT SET'
      );
      debugLog('✅ airtableConnection 類型:', typeof airtableConnection);
      debugLog(
        '✅ airtableConnection 函數:',
        Object.keys(airtableConnection)
      );
    } catch (error) {
      debugLog('⚠️ Airtable 連接模組未找到:', error.message);
      debugLog('⚠️ Error stack:', error.stack);
      airtableConnection = null; // 確保設為 null
    }
  } else {
    debugLog('⚠️ 不滿足 Airtable 條件，跳過載入');
    airtableConnection = null; // 確保設為 null
  }

  // 其次使用 MongoDB（如果已設定）
  if (
    !airtableConnection &&
    process.env.MONGODB_URI &&
    !process.env.BACKEND_API_URL
  ) {
    try {
      const mongoPath = require('path').resolve(
        __dirname,
        '../../../database/connection'
      );
      dbConnection = require(mongoPath);
      debugLog('✅ 已載入 MongoDB 連接模組');
    } catch (error) {
      debugLog('⚠️ MongoDB 連接模組未找到，將使用 API 模式');
    }
  }
}

// 不在模組載入時初始化，而是在 handler 執行時才初始化
// 這樣可以確保環境變數已經正確載入

exports.handler = async (event, context) => {
  // 每次請求時重新載入環境變數（確保使用最新的設定）
  loadEnvVars();

  // 每次請求時重新初始化連接（確保使用最新的環境變數）
  // 這樣可以確保環境變數已經正確載入
  initConnections();
  // 處理 CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // 處理 OPTIONS 請求（CORS preflight）
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  const { httpMethod, path, queryStringParameters, body } = event;

  // 記錄 path 以便調試
  debugLog('🔍 Event path:', path);
  debugLog('🔍 Event queryStringParameters:', queryStringParameters);

  try {
    // 處理 /api/debug-log 端點（臨時診斷：試寫一筆到 TrackingLogs 並回傳真實結果）
    if (path.includes('/debug-log')) {
      const tableName = process.env.AIRTABLE_LOGS_TABLE || 'TrackingLogs';
      const diag = {
        hasApiKey: Boolean(process.env.AIRTABLE_API_KEY),
        hasBaseId: Boolean(process.env.AIRTABLE_BASE_ID),
        baseId: process.env.AIRTABLE_BASE_ID || null,
        tableName,
        enableFlag: process.env.ENABLE_TRACKING_LOGS ?? '(unset)',
      };
      try {
        const base = initLogBase();
        const created = await base(tableName).create([
          {
            fields: {
              Timestamp: new Date().toISOString(),
              OrderNo: 'DEBUG',
              TrackingNo: 'DEBUG',
              StatusCode: '200',
              Success: 'true',
              Method: 'DEBUG',
              Path: '/debug-log',
            },
          },
        ]);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Write OK',
            recordId: created?.[0]?.id || null,
            diag,
          }),
        };
      } catch (error) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            error: error.message,
            statusCode: error.statusCode,
            diag,
          }),
        };
      }
    }

    // 處理 /api/debug-ip 端點（調試用，顯示 IP 和 rate limit 資訊）
    if (path.includes('/api/debug-ip') || path.includes('/debug-ip')) {
      // ?write=1 → 試寫一筆到 TrackingLogs 並回傳真實結果（臨時診斷）
      if (queryStringParameters?.write === '1') {
        const tableName = process.env.AIRTABLE_LOGS_TABLE || 'TrackingLogs';
        const diag = {
          hasApiKey: Boolean(process.env.AIRTABLE_API_KEY),
          hasBaseId: Boolean(process.env.AIRTABLE_BASE_ID),
          baseId: process.env.AIRTABLE_BASE_ID || null,
          tableName,
          enableFlag: process.env.ENABLE_TRACKING_LOGS ?? '(unset)',
        };
        try {
          const base = initLogBase();
          const created = await base(tableName).create([
            {
              fields: {
                Timestamp: new Date().toISOString(),
                OrderNo: 'DEBUG',
                TrackingNo: 'DEBUG',
                StatusCode: '200',
                Success: 'true',
                Method: 'DEBUG',
                Path: '/debug-ip?write=1',
              },
            },
          ]);
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              message: 'Write OK',
              recordId: created?.[0]?.id || null,
              diag,
            }),
          };
        } catch (error) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: false,
              error: error.message,
              statusCode: error.statusCode,
              diag,
            }),
          };
        }
      }

      const clientIP = getClientIP(event);
      const rateLimitResult = checkRateLimit(clientIP);
      const isLocalIP =
        !clientIP ||
        clientIP === 'unknown' ||
        clientIP.startsWith('127.') ||
        clientIP.startsWith('192.168.') ||
        clientIP.startsWith('10.') ||
        clientIP === '::1';

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          clientIP: clientIP,
          isLocalIP: isLocalIP,
          rateLimitResult: rateLimitResult,
          headers: {
            'x-forwarded-for': event.headers?.['x-forwarded-for'],
            'x-client-ip': event.headers?.['x-client-ip'],
            'client-ip': event.headers?.['client-ip'],
          },
          message: isLocalIP
            ? '本地 IP 被排除在 rate limit 之外（開發環境）'
            : '此 IP 會受到 rate limit 限制',
        }),
      };
    }

    // 處理 /api/health 端點（支援重定向後的 path）
    if (path.includes('/api/health') || path.includes('/health')) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString(),
          service: 'TailorMed Tracking API',
          airtable: process.env.AIRTABLE_API_KEY
            ? 'configured'
            : 'not configured',
        }),
      };
    }

    // 處理 /api/tracking 和 /api/tracking-public 端點（支援重定向後的 path）
    // Netlify 重定向後，path 可能是 /.netlify/functions/tracking
    if (
      path.includes('/api/tracking') ||
      path.includes('/api/tracking-public') ||
      path.includes('/.netlify/functions/tracking') ||
      path === '/tracking'
    ) {
      // 提取並驗證 API Key
      const apiKey = extractApiKey(event);
      const hasApiKey = apiKey ? validateApiKey(apiKey) : false;
      const requestStart = Date.now();

      // 獲取客戶端 IP 並檢查 Rate Limit（傳入 API Key 狀態）
      const clientIP = getClientIP(event);

      const rateLimitResult = checkRateLimit(clientIP, hasApiKey);
      debugLog(
        '🔍 Rate limit check result:',
        JSON.stringify(rateLimitResult, null, 2)
      );
      debugLog(
        '🔍 IP 是否為本地:',
        !clientIP ||
          clientIP === 'unknown' ||
          clientIP.startsWith('127.') ||
          clientIP.startsWith('192.168.') ||
          clientIP.startsWith('10.') ||
          clientIP === '::1'
      );

      if (!rateLimitResult.allowed) {
        debugLog(
          '⚠️ Rate limit exceeded for IP:',
          clientIP,
          rateLimitResult
        );
        return await logAndReturn(
          {
          statusCode: 429,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'rate_limit',
            errorType: 'rate_limit',
            message: rateLimitResult.message,
            limitType: rateLimitResult.limitType,
            limit: rateLimitResult.limit,
            waitTime: rateLimitResult.waitTime,
          }),
          },
          {
            Timestamp: new Date().toISOString(),
            Method: httpMethod,
            Path: path,
            ClientIP: clientIP,
            UserAgent: event.headers?.['user-agent'],
            ApiKeyUsed: Boolean(apiKey),
            ApiKeyValid: hasApiKey,
            StatusCode: 429,
            Success: false,
            ErrorType: 'rate_limit',
            ErrorMessage: rateLimitResult.message,
            ResponseTimeMs: Date.now() - requestStart,
          }
        );
      }

      debugLog('✅ Rate limit check passed for IP:', clientIP);

      let orderNo, trackingNo;

      // GET 請求：從 query parameters 取得
      if (httpMethod === 'GET') {
        orderNo = queryStringParameters?.orderNo;
        trackingNo = queryStringParameters?.trackingNo;
      }

      // POST 請求：從 body 取得
      if (httpMethod === 'POST') {
        const parsedBody = body ? JSON.parse(body) : {};
        orderNo = parsedBody.order || parsedBody.orderNo;
        trackingNo = parsedBody.job || parsedBody.trackingNo;
      }

      // 驗證參數
      if (!orderNo || !trackingNo) {
        return await logAndReturn(
          {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Missing parameters',
            message: 'Both orderNo and trackingNo are required',
          }),
          },
          {
            Timestamp: new Date().toISOString(),
            Method: httpMethod,
            Path: path,
            ClientIP: clientIP,
            UserAgent: event.headers?.['user-agent'],
            ApiKeyUsed: Boolean(apiKey),
            ApiKeyValid: hasApiKey,
            OrderNo: orderNo,
            TrackingNo: trackingNo,
            StatusCode: 400,
            Success: false,
            ErrorType: 'missing_parameters',
            ErrorMessage: 'Both orderNo and trackingNo are required',
            ResponseTimeMs: Date.now() - requestStart,
          }
        );
      }

      debugLog('🔍 Checking Airtable connection...');
      debugLog(
        'airtableConnection:',
        airtableConnection ? 'SET' : 'NOT SET'
      );
      debugLog(
        'AIRTABLE_API_KEY:',
        process.env.AIRTABLE_API_KEY
          ? 'SET (' + process.env.AIRTABLE_API_KEY.substring(0, 15) + '...)'
          : 'NOT SET'
      );
      debugLog(
        'AIRTABLE_BASE_ID:',
        process.env.AIRTABLE_BASE_ID || 'NOT SET'
      );
      debugLog(
        'AIRTABLE_SHIPMENTS_TABLE:',
        process.env.AIRTABLE_SHIPMENTS_TABLE || 'NOT SET'
      );
      debugLog('BACKEND_API_URL:', process.env.BACKEND_API_URL || 'NOT SET');

      // 如果連接模組未初始化，重新初始化（因為環境變數可能剛載入）
      if (
        !airtableConnection &&
        process.env.AIRTABLE_API_KEY &&
        process.env.AIRTABLE_BASE_ID &&
        !process.env.BACKEND_API_URL
      ) {
        try {
          // 在 Netlify Function 環境中，優先使用同目錄下的 database 模組
          // 如果不存在，則嘗試使用相對路徑
          const path = require('path');
          const fs = require('fs');

          // 在 Netlify 部署環境中，直接使用相對路徑 require
          // airtable.js 應該在同一個目錄下
          try {
            // 先嘗試直接 require（最簡單的方式）
            airtableConnection = require('./airtable');
            debugLog(
              '✅ 已載入 Airtable 連接模組（在 handler 中，直接 require）'
            );
          } catch (requireError) {
            // 如果直接 require 失敗，嘗試使用完整路徑
            debugLog(
              '⚠️ 直接 require 失敗，嘗試使用完整路徑:',
              requireError.message
            );
            const localPath = path.join(__dirname, 'airtable.js');
            const fallbackPath = path.resolve(
              __dirname,
              '../../../database/airtable.js'
            );

            if (fs.existsSync(localPath)) {
              // 清除緩存
              if (require.cache[localPath]) {
                delete require.cache[localPath];
              }
              airtableConnection = require(localPath);
              debugLog(
                '✅ 已載入 Airtable 連接模組（在 handler 中，使用完整路徑）:',
                localPath
              );
            } else if (fs.existsSync(fallbackPath)) {
              if (require.cache[fallbackPath]) {
                delete require.cache[fallbackPath];
              }
              airtableConnection = require(fallbackPath);
              debugLog(
                '✅ 已載入 Airtable 連接模組（在 handler 中，使用備用路徑）:',
                fallbackPath
              );
            } else {
              console.error('❌ 無法找到 airtable 模組，嘗試的路徑:');
              console.error('  - ./airtable (相對路徑)');
              console.error('  -', localPath);
              console.error('  -', fallbackPath);
              console.error('  - __dirname:', __dirname);
              throw new Error(
                `Cannot find airtable module. Checked: ./airtable, ${localPath}, ${fallbackPath}`
              );
            }
          }
          debugLog('✅ 已載入 Airtable 連接模組（在 handler 中）');
        } catch (error) {
          debugLog('⚠️ Airtable 連接模組載入失敗:', error.message);
          debugLog('⚠️ Error stack:', error.stack);
        }
      }

      // 檢查條件
      const hasAirtableConfig =
        process.env.AIRTABLE_API_KEY &&
        process.env.AIRTABLE_BASE_ID &&
        !process.env.BACKEND_API_URL;
      debugLog('hasAirtableConfig:', hasAirtableConfig);
      debugLog(
        'airtableConnection after check:',
        airtableConnection ? 'SET' : 'NOT SET'
      );

      if (airtableConnection && hasAirtableConfig) {
        try {
          debugLog('✅ Using Airtable connection');
          debugLog('🔍 Querying:', orderNo, trackingNo);
          const { findShipment, findTimeline } = airtableConnection;

          // 查詢貨件資料
          let shipment;
          try {
            shipment = await findShipment(orderNo, trackingNo);
            debugLog(
              '📦 Shipment result:',
              shipment ? 'Found' : 'Not found'
            );
            if (shipment) {
              debugLog('📦 Shipment details:', {
                orderNo: shipment.orderNo,
                trackingNo: shipment.trackingNo,
                origin: shipment.origin,
                destination: shipment.destination,
              });
            }
          } catch (queryError) {
            console.error('❌ Airtable query error:', queryError);
            console.error('❌ Error stack:', queryError.stack);
            return await logAndReturn(
              {
              statusCode: 500,
              headers,
              body: JSON.stringify({
                success: false,
                error: 'Airtable query failed',
                message: queryError.message,
              }),
              },
              {
                Timestamp: new Date().toISOString(),
                Method: httpMethod,
                Path: path,
                ClientIP: clientIP,
                UserAgent: event.headers?.['user-agent'],
                ApiKeyUsed: Boolean(apiKey),
                ApiKeyValid: hasApiKey,
                OrderNo: orderNo,
                TrackingNo: trackingNo,
                StatusCode: 500,
                Success: false,
                ErrorType: 'airtable_query_failed',
                ErrorMessage: queryError.message,
                ResponseTimeMs: Date.now() - requestStart,
              }
            );
          }

          if (!shipment) {
            debugLog('⚠️ No shipment found for:', orderNo, trackingNo);
            return await logAndReturn(
              {
              statusCode: 404,
              headers,
              body: JSON.stringify({
                success: false,
                message: 'No record found. Please verify the tracking number.',
              }),
              },
              {
                Timestamp: new Date().toISOString(),
                Method: httpMethod,
                Path: path,
                ClientIP: clientIP,
                UserAgent: event.headers?.['user-agent'],
                ApiKeyUsed: Boolean(apiKey),
                ApiKeyValid: hasApiKey,
                OrderNo: orderNo,
                TrackingNo: trackingNo,
                StatusCode: 404,
                Success: false,
                ErrorType: 'not_found',
                ErrorMessage: 'No record found. Please verify the tracking number.',
                ResponseTimeMs: Date.now() - requestStart,
              }
            );
          }

          // 查詢時間軸資料（傳入 shipment 的原始欄位以便生成 timeline）
          const timeline = await findTimeline(trackingNo, shipment._raw);

          // 格式化回應資料
          const responseData = {
            success: true,
            data: {
              id: shipment.id,
              orderNo: shipment.orderNo,
              trackingNo: shipment.trackingNo,
              status: shipment.status || 'pending',
              origin: shipment.origin || '',
              destination: shipment.destination || '',
              originDestination: shipment.originDestination || '', // 包含 Origin/Destination 欄位（直接顯示資料庫中的值）
              packageCount: shipment.packageCount || 1,
              weight: shipment.weight || '',
              eta: shipment.eta || '',
              invoiceNo: shipment.invoiceNo || '',
              mawb: shipment.mawb || '',
              lastUpdate: shipment.lastUpdate || '',
              transportType: shipment.transportType || '', // 包含 Transport Type
              timeline: timeline.map((item) => ({
                step: item.step,
                title: item.title,
                time: item.time || item.date,
                status: item.status || 'pending',
                isEvent: item.isEvent || false,
                date: item.date,
                isOrderCompleted: item.isOrderCompleted || false, // 包含訂單完成狀態
              })),
            },
          };

          return await logAndReturn(
            {
            statusCode: 200,
            headers,
            body: JSON.stringify(responseData),
            },
            {
              Timestamp: new Date().toISOString(),
              Method: httpMethod,
              Path: path,
              ClientIP: clientIP,
              UserAgent: event.headers?.['user-agent'],
              ApiKeyUsed: Boolean(apiKey),
              ApiKeyValid: hasApiKey,
              OrderNo: orderNo,
              TrackingNo: trackingNo,
              StatusCode: 200,
              Success: true,
              ResponseTimeMs: Date.now() - requestStart,
            }
          );
        } catch (error) {
          console.error('Airtable query error:', error);
          return await logAndReturn(
            {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Airtable query failed',
              message: error.message,
            }),
            },
            {
              Timestamp: new Date().toISOString(),
              Method: httpMethod,
              Path: path,
              ClientIP: clientIP,
              UserAgent: event.headers?.['user-agent'],
              ApiKeyUsed: Boolean(apiKey),
              ApiKeyValid: hasApiKey,
              OrderNo: orderNo,
              TrackingNo: trackingNo,
              StatusCode: 500,
              Success: false,
              ErrorType: 'airtable_query_failed',
              ErrorMessage: error.message,
              ResponseTimeMs: Date.now() - requestStart,
            }
          );
        }
      }

      // 其次使用本地 MongoDB 連接（如果已設定 MONGODB_URI 且沒有設定 BACKEND_API_URL）
      if (
        dbConnection &&
        process.env.MONGODB_URI &&
        !process.env.BACKEND_API_URL
      ) {
        try {
          const { findShipment, findTimeline } = dbConnection;

          // 查詢貨件資料
          const shipment = await findShipment(orderNo, trackingNo);

          if (!shipment) {
            return await logAndReturn(
              {
              statusCode: 404,
              headers,
              body: JSON.stringify({
                success: false,
                message: 'No record found. Please verify the tracking number.',
              }),
              },
              {
                Timestamp: new Date().toISOString(),
                Method: httpMethod,
                Path: path,
                ClientIP: clientIP,
                UserAgent: event.headers?.['user-agent'],
                ApiKeyUsed: Boolean(apiKey),
                ApiKeyValid: hasApiKey,
                OrderNo: orderNo,
                TrackingNo: trackingNo,
                StatusCode: 404,
                Success: false,
                ErrorType: 'not_found',
                ErrorMessage: 'No record found. Please verify the tracking number.',
                ResponseTimeMs: Date.now() - requestStart,
              }
            );
          }

          // 查詢時間軸資料（如果 shipment 有 _raw 欄位，傳入以便生成 timeline）
          const timeline = await findTimeline(
            trackingNo,
            shipment._raw || shipment
          );

          // 格式化回應資料
          const responseData = {
            success: true,
            data: {
              id: shipment._id?.toString() || shipment.id,
              orderNo: shipment.orderNo,
              trackingNo: shipment.trackingNo,
              status: shipment.status || 'pending',
              origin: shipment.origin,
              destination: shipment.destination,
              packageCount: shipment.packageCount || 1,
              weight: shipment.weight,
              eta: shipment.eta,
              invoiceNo: shipment.invoiceNo,
              lastUpdate: shipment.lastUpdate || shipment.updatedAt,
              timeline: timeline.map((item) => ({
                step: item.step,
                title: item.title || item.status,
                time: item.time || item.date,
                status: item.status || 'pending',
                isEvent: item.isEvent || false,
                date: item.date,
              })),
            },
          };

          return await logAndReturn(
            {
            statusCode: 200,
            headers,
            body: JSON.stringify(responseData),
            },
            {
              Timestamp: new Date().toISOString(),
              Method: httpMethod,
              Path: path,
              ClientIP: clientIP,
              UserAgent: event.headers?.['user-agent'],
              ApiKeyUsed: Boolean(apiKey),
              ApiKeyValid: hasApiKey,
              OrderNo: orderNo,
              TrackingNo: trackingNo,
              StatusCode: 200,
              Success: true,
              ResponseTimeMs: Date.now() - requestStart,
            }
          );
        } catch (error) {
          console.error('Database query error:', error);
          return await logAndReturn(
            {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Database query failed',
              message: error.message,
            }),
            },
            {
              Timestamp: new Date().toISOString(),
              Method: httpMethod,
              Path: path,
              ClientIP: clientIP,
              UserAgent: event.headers?.['user-agent'],
              ApiKeyUsed: Boolean(apiKey),
              ApiKeyValid: hasApiKey,
              OrderNo: orderNo,
              TrackingNo: trackingNo,
              StatusCode: 500,
              Success: false,
              ErrorType: 'database_query_failed',
              ErrorMessage: error.message,
              ResponseTimeMs: Date.now() - requestStart,
            }
          );
        }
      }

      // 連接後端 API（如果已設定環境變數）
      const backendApiUrl = process.env.BACKEND_API_URL;

      if (backendApiUrl) {
        try {
          // 構建後端 API URL（API Key 透過 Authorization header 傳遞，不放入 URL）
          const apiKey =
            queryStringParameters?.apiKey || process.env.BACKEND_API_KEY;
          const backendUrl = `${backendApiUrl}/api/tracking?orderNo=${encodeURIComponent(
            orderNo
          )}&trackingNo=${encodeURIComponent(trackingNo)}`;

          // 呼叫後端 API
          const backendResponse = await fetch(backendUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
            },
          });

          if (!backendResponse.ok) {
            if (backendResponse.status === 404) {
              return await logAndReturn(
                {
                statusCode: 404,
                headers,
                body: JSON.stringify({
                  success: false,
                  message:
                    'No record found. Please verify the tracking number.',
                }),
                },
                {
                  Timestamp: new Date().toISOString(),
                  Method: httpMethod,
                  Path: path,
                  ClientIP: clientIP,
                  UserAgent: event.headers?.['user-agent'],
                  ApiKeyUsed: Boolean(apiKey),
                  ApiKeyValid: hasApiKey,
                  OrderNo: orderNo,
                  TrackingNo: trackingNo,
                  StatusCode: 404,
                  Success: false,
                  ErrorType: 'not_found',
                  ErrorMessage:
                    'No record found. Please verify the tracking number.',
                  ResponseTimeMs: Date.now() - requestStart,
                }
              );
            }

            if (backendResponse.status === 429) {
              const errorData = await backendResponse.json().catch(() => ({}));
              return await logAndReturn(
                {
                statusCode: 429,
                headers,
                body: JSON.stringify({
                  success: false,
                  message:
                    errorData.message ||
                    'Query limit reached (10 per hour). Please try again later.',
                }),
                },
                {
                  Timestamp: new Date().toISOString(),
                  Method: httpMethod,
                  Path: path,
                  ClientIP: clientIP,
                  UserAgent: event.headers?.['user-agent'],
                  ApiKeyUsed: Boolean(apiKey),
                  ApiKeyValid: hasApiKey,
                  OrderNo: orderNo,
                  TrackingNo: trackingNo,
                  StatusCode: 429,
                  Success: false,
                  ErrorType: 'rate_limit',
                  ErrorMessage:
                    errorData.message ||
                    'Query limit reached (10 per hour). Please try again later.',
                  ResponseTimeMs: Date.now() - requestStart,
                }
              );
            }

            throw new Error(
              `Backend API returned status ${backendResponse.status}`
            );
          }

          const backendData = await backendResponse.json();

          // 確保返回格式一致
          return await logAndReturn(
            {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              data: backendData.data || backendData,
            }),
            },
            {
              Timestamp: new Date().toISOString(),
              Method: httpMethod,
              Path: path,
              ClientIP: clientIP,
              UserAgent: event.headers?.['user-agent'],
              ApiKeyUsed: Boolean(apiKey),
              ApiKeyValid: hasApiKey,
              OrderNo: orderNo,
              TrackingNo: trackingNo,
              StatusCode: 200,
              Success: true,
              ResponseTimeMs: Date.now() - requestStart,
            }
          );
        } catch (error) {
          console.error('Backend API error:', error);

          // 如果後端 API 失敗，返回錯誤（不返回 mock 資料）
          return await logAndReturn(
            {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Backend service unavailable',
              message:
                'Unable to connect to backend service. Please try again later.',
            }),
            },
            {
              Timestamp: new Date().toISOString(),
              Method: httpMethod,
              Path: path,
              ClientIP: clientIP,
              UserAgent: event.headers?.['user-agent'],
              ApiKeyUsed: Boolean(apiKey),
              ApiKeyValid: hasApiKey,
              OrderNo: orderNo,
              TrackingNo: trackingNo,
              StatusCode: 500,
              Success: false,
              ErrorType: 'backend_unavailable',
              ErrorMessage: error.message,
              ResponseTimeMs: Date.now() - requestStart,
            }
          );
        }
      }

      // 如果沒有設定任何資料來源，返回錯誤
      return await logAndReturn(
        {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'No record found. Please verify the tracking number.',
        }),
        },
        {
          Timestamp: new Date().toISOString(),
          Method: httpMethod,
          Path: path,
          ClientIP: clientIP,
          UserAgent: event.headers?.['user-agent'],
          ApiKeyUsed: Boolean(apiKey),
          ApiKeyValid: hasApiKey,
          OrderNo: orderNo,
          TrackingNo: trackingNo,
          StatusCode: 404,
          Success: false,
          ErrorType: 'not_found',
          ErrorMessage: 'No record found. Please verify the tracking number.',
          ResponseTimeMs: Date.now() - requestStart,
        }
      );
    }

    // 處理 /api/tracking/timeline/:trackingNo（如果需要）
    if (path.includes('/api/tracking/timeline/')) {
      const trackingNo = path.split('/timeline/')[1];

      if (!trackingNo) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Missing trackingNo',
            message: 'Tracking number is required',
          }),
        };
      }

      // 查詢時間軸事件
      // 如果沒有設定任何資料來源，返回錯誤
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'No timeline found for this tracking number.',
        }),
      };
    }

    // 未找到對應的路由
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        error: 'Not found',
        message: 'API endpoint not found',
      }),
    };
  } catch (error) {
    console.error('Tracking API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
    };
  }
};

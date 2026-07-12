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

// 一般診斷訊息僅在 DEBUG=true 時輸出，避免雜訊與機敏資訊外洩到 Netlify Function logs
const DEBUG = process.env.DEBUG === 'true';
function debugLog(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

// 查詢記錄（暫時停用，未來可接 Airtable TrackingLogs 或其他儲存）
async function logTrackingRequest(logData) {
  // Monitor 功能暫停，等待後續實作
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
  const headers = event.headers || {};
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

  const envPaths = [
    path.resolve(__dirname, '../../../../../../.env'),
    path.resolve(__dirname, '../../.env'),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
      debugLog('✅ 已載入 .env 檔案:', envPath);
      return;
    }
  }

  debugLog('⚠️ 未找到 .env 檔案');
}

// 初始化連接模組
function initConnections() {
  loadEnvVars();

  debugLog('🔧 initConnections() - 環境變數狀態:');
  debugLog('  AIRTABLE_API_KEY:', process.env.AIRTABLE_API_KEY ? 'SET' : 'NOT SET');
  debugLog('  AIRTABLE_BASE_ID:', process.env.AIRTABLE_BASE_ID || 'NOT SET');
  debugLog('  BACKEND_API_URL:', process.env.BACKEND_API_URL || 'NOT SET');

  if (
    process.env.AIRTABLE_API_KEY &&
    process.env.AIRTABLE_BASE_ID &&
    !process.env.BACKEND_API_URL
  ) {
    try {
      const path = require('path');
      const fs = require('fs');

      try {
        airtableConnection = require('./airtable');
        debugLog('✅ 已載入 Airtable 連接模組（直接 require）');
      } catch (requireError) {
        debugLog('⚠️ 直接 require 失敗，嘗試使用完整路徑:', requireError.message);
        const localPath = path.join(__dirname, 'airtable.js');
        const fallbackPath = path.resolve(__dirname, '../../../database/airtable.js');

        if (fs.existsSync(localPath)) {
          if (require.cache[localPath]) delete require.cache[localPath];
          airtableConnection = require(localPath);
          debugLog('✅ 已載入 Airtable 連接模組（完整路徑）:', localPath);
        } else if (fs.existsSync(fallbackPath)) {
          if (require.cache[fallbackPath]) delete require.cache[fallbackPath];
          airtableConnection = require(fallbackPath);
          debugLog('✅ 已載入 Airtable 連接模組（備用路徑）:', fallbackPath);
        } else {
          throw new Error(`Cannot find airtable module. Checked: ${localPath}, ${fallbackPath}`);
        }
      }
    } catch (error) {
      debugLog('⚠️ Airtable 連接模組未找到:', error.message);
      airtableConnection = null;
    }
  } else {
    airtableConnection = null;
  }

  if (!airtableConnection && process.env.MONGODB_URI && !process.env.BACKEND_API_URL) {
    try {
      const mongoPath = require('path').resolve(__dirname, '../../../database/connection');
      dbConnection = require(mongoPath);
      debugLog('✅ 已載入 MongoDB 連接模組');
    } catch (error) {
      debugLog('⚠️ MongoDB 連接模組未找到，將使用 API 模式');
    }
  }
}

exports.handler = async (event, context) => {
  loadEnvVars();
  initConnections();

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { httpMethod, path, queryStringParameters, body } = event;

  debugLog('🔍 Event path:', path);
  debugLog('🔍 Event queryStringParameters:', queryStringParameters);

  try {
    // /api/debug-ip
    if (path.includes('/api/debug-ip') || path.includes('/debug-ip')) {
      const clientIP = getClientIP(event);
      const rateLimitResult = checkRateLimit(clientIP);
      const isLocalIP =
        !clientIP || clientIP === 'unknown' ||
        clientIP.startsWith('127.') || clientIP.startsWith('192.168.') ||
        clientIP.startsWith('10.') || clientIP === '::1';

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          clientIP,
          isLocalIP,
          rateLimitResult,
          headers: {
            'x-forwarded-for': event.headers?.['x-forwarded-for'],
            'x-client-ip': event.headers?.['x-client-ip'],
            'client-ip': event.headers?.['client-ip'],
          },
          message: isLocalIP ? '本地 IP 被排除在 rate limit 之外（開發環境）' : '此 IP 會受到 rate limit 限制',
        }),
      };
    }

    // /api/health
    if (path.includes('/api/health') || path.includes('/health')) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString(),
          service: 'TailorMed Tracking API',
          airtable: process.env.AIRTABLE_API_KEY ? 'configured' : 'not configured',
        }),
      };
    }

    // /api/tracking
    if (
      path.includes('/api/tracking') ||
      path.includes('/api/tracking-public') ||
      path.includes('/.netlify/functions/tracking') ||
      path === '/tracking'
    ) {
      const apiKey = extractApiKey(event);
      const hasApiKey = apiKey ? validateApiKey(apiKey) : false;
      const requestStart = Date.now();
      const clientIP = getClientIP(event);
      const rateLimitResult = checkRateLimit(clientIP, hasApiKey);

      debugLog('🔍 Rate limit check result:', JSON.stringify(rateLimitResult, null, 2));

      if (!rateLimitResult.allowed) {
        debugLog('⚠️ Rate limit exceeded for IP:', clientIP, rateLimitResult);
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
            StatusCode: 429,
            Success: false,
            ErrorType: 'rate_limit',
            ResponseTimeMs: Date.now() - requestStart,
          }
        );
      }

      debugLog('✅ Rate limit check passed for IP:', clientIP);

      let orderNo, trackingNo;

      if (httpMethod === 'GET') {
        orderNo = queryStringParameters?.orderNo;
        trackingNo = queryStringParameters?.trackingNo;
      }

      if (httpMethod === 'POST') {
        const parsedBody = body ? JSON.parse(body) : {};
        orderNo = parsedBody.order || parsedBody.orderNo;
        trackingNo = parsedBody.job || parsedBody.trackingNo;
      }

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
            OrderNo: orderNo,
            TrackingNo: trackingNo,
            StatusCode: 400,
            Success: false,
            ErrorType: 'missing_parameters',
            ResponseTimeMs: Date.now() - requestStart,
          }
        );
      }

      // 如果連接模組未初始化，重新初始化
      if (
        !airtableConnection &&
        process.env.AIRTABLE_API_KEY &&
        process.env.AIRTABLE_BASE_ID &&
        !process.env.BACKEND_API_URL
      ) {
        try {
          const path2 = require('path');
          const fs = require('fs');
          try {
            airtableConnection = require('./airtable');
          } catch (requireError) {
            const localPath = path2.join(__dirname, 'airtable.js');
            const fallbackPath = path2.resolve(__dirname, '../../../database/airtable.js');
            if (fs.existsSync(localPath)) {
              if (require.cache[localPath]) delete require.cache[localPath];
              airtableConnection = require(localPath);
            } else if (fs.existsSync(fallbackPath)) {
              if (require.cache[fallbackPath]) delete require.cache[fallbackPath];
              airtableConnection = require(fallbackPath);
            }
          }
        } catch (error) {
          debugLog('⚠️ Airtable 連接模組載入失敗:', error.message);
        }
      }

      const hasAirtableConfig =
        process.env.AIRTABLE_API_KEY &&
        process.env.AIRTABLE_BASE_ID &&
        !process.env.BACKEND_API_URL;

      if (airtableConnection && hasAirtableConfig) {
        try {
          debugLog('✅ Using Airtable connection');
          const { findShipment, findTimeline } = airtableConnection;

          let shipment;
          try {
            shipment = await findShipment(orderNo, trackingNo);
          } catch (queryError) {
            console.error('❌ Airtable query error:', queryError);
            return await logAndReturn(
              {
                statusCode: 500,
                headers,
                body: JSON.stringify({ success: false, error: 'Airtable query failed', message: queryError.message }),
              },
              { Timestamp: new Date().toISOString(), Method: httpMethod, Path: path, ClientIP: clientIP, OrderNo: orderNo, TrackingNo: trackingNo, StatusCode: 500, Success: false, ErrorType: 'airtable_query_failed', ResponseTimeMs: Date.now() - requestStart }
            );
          }

          if (!shipment) {
            return await logAndReturn(
              {
                statusCode: 404,
                headers,
                body: JSON.stringify({ success: false, message: 'No record found. Please verify the tracking number.' }),
              },
              { Timestamp: new Date().toISOString(), Method: httpMethod, Path: path, ClientIP: clientIP, OrderNo: orderNo, TrackingNo: trackingNo, StatusCode: 404, Success: false, ErrorType: 'not_found', ResponseTimeMs: Date.now() - requestStart }
            );
          }

          const timeline = await findTimeline(trackingNo, shipment._raw);

          const responseData = {
            success: true,
            data: {
              id: shipment.id,
              orderNo: shipment.orderNo,
              trackingNo: shipment.trackingNo,
              status: shipment.status || 'pending',
              origin: shipment.origin || '',
              destination: shipment.destination || '',
              originDestination: shipment.originDestination || '',
              packageCount: shipment.packageCount || 1,
              weight: shipment.weight || '',
              eta: shipment.eta || '',
              invoiceNo: shipment.invoiceNo || '',
              mawb: shipment.mawb || '',
              lastUpdate: shipment.lastUpdate || '',
              transportType: shipment.transportType || '',
              timeline: timeline.map((item) => ({
                step: item.step,
                title: item.title,
                time: item.time || item.date,
                status: item.status || 'pending',
                isEvent: item.isEvent || false,
                date: item.date,
                isOrderCompleted: item.isOrderCompleted || false,
              })),
            },
          };

          return await logAndReturn(
            { statusCode: 200, headers, body: JSON.stringify(responseData) },
            { Timestamp: new Date().toISOString(), Method: httpMethod, Path: path, ClientIP: clientIP, OrderNo: orderNo, TrackingNo: trackingNo, StatusCode: 200, Success: true, ResponseTimeMs: Date.now() - requestStart }
          );
        } catch (error) {
          console.error('Airtable query error:', error);
          return await logAndReturn(
            { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Airtable query failed', message: error.message }) },
            { Timestamp: new Date().toISOString(), Method: httpMethod, Path: path, ClientIP: clientIP, OrderNo: orderNo, TrackingNo: trackingNo, StatusCode: 500, Success: false, ErrorType: 'airtable_query_failed', ResponseTimeMs: Date.now() - requestStart }
          );
        }
      }

      if (dbConnection && process.env.MONGODB_URI && !process.env.BACKEND_API_URL) {
        try {
          const { findShipment, findTimeline } = dbConnection;
          const shipment = await findShipment(orderNo, trackingNo);

          if (!shipment) {
            return await logAndReturn(
              { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'No record found. Please verify the tracking number.' }) },
              { Timestamp: new Date().toISOString(), Method: httpMethod, Path: path, ClientIP: clientIP, OrderNo: orderNo, TrackingNo: trackingNo, StatusCode: 404, Success: false, ErrorType: 'not_found', ResponseTimeMs: Date.now() - requestStart }
            );
          }

          const timeline = await findTimeline(trackingNo, shipment._raw || shipment);
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
            { statusCode: 200, headers, body: JSON.stringify(responseData) },
            { Timestamp: new Date().toISOString(), Method: httpMethod, Path: path, ClientIP: clientIP, OrderNo: orderNo, TrackingNo: trackingNo, StatusCode: 200, Success: true, ResponseTimeMs: Date.now() - requestStart }
          );
        } catch (error) {
          console.error('Database query error:', error);
          return await logAndReturn(
            { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Database query failed', message: error.message }) },
            { Timestamp: new Date().toISOString(), Method: httpMethod, Path: path, ClientIP: clientIP, OrderNo: orderNo, TrackingNo: trackingNo, StatusCode: 500, Success: false, ErrorType: 'database_query_failed', ResponseTimeMs: Date.now() - requestStart }
          );
        }
      }

      const backendApiUrl = process.env.BACKEND_API_URL;
      if (backendApiUrl) {
        try {
          const bkApiKey = queryStringParameters?.apiKey || process.env.BACKEND_API_KEY;
          const backendUrl = `${backendApiUrl}/api/tracking?orderNo=${encodeURIComponent(orderNo)}&trackingNo=${encodeURIComponent(trackingNo)}`;
          const backendResponse = await fetch(backendUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...(bkApiKey && { Authorization: `Bearer ${bkApiKey}` }),
            },
          });

          if (!backendResponse.ok) {
            if (backendResponse.status === 404) {
              return await logAndReturn(
                { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'No record found. Please verify the tracking number.' }) },
                { Timestamp: new Date().toISOString(), Method: httpMethod, Path: path, ClientIP: clientIP, OrderNo: orderNo, TrackingNo: trackingNo, StatusCode: 404, Success: false, ErrorType: 'not_found', ResponseTimeMs: Date.now() - requestStart }
              );
            }
            if (backendResponse.status === 429) {
              const errorData = await backendResponse.json().catch(() => ({}));
              return await logAndReturn(
                { statusCode: 429, headers, body: JSON.stringify({ success: false, message: errorData.message || 'Query limit reached. Please try again later.' }) },
                { Timestamp: new Date().toISOString(), Method: httpMethod, Path: path, ClientIP: clientIP, OrderNo: orderNo, TrackingNo: trackingNo, StatusCode: 429, Success: false, ErrorType: 'rate_limit', ResponseTimeMs: Date.now() - requestStart }
              );
            }
            throw new Error(`Backend API returned status ${backendResponse.status}`);
          }

          const backendData = await backendResponse.json();
          return await logAndReturn(
            { statusCode: 200, headers, body: JSON.stringify({ success: true, data: backendData.data || backendData }) },
            { Timestamp: new Date().toISOString(), Method: httpMethod, Path: path, ClientIP: clientIP, OrderNo: orderNo, TrackingNo: trackingNo, StatusCode: 200, Success: true, ResponseTimeMs: Date.now() - requestStart }
          );
        } catch (error) {
          console.error('Backend API error:', error);
          return await logAndReturn(
            { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Backend service unavailable', message: 'Unable to connect to backend service. Please try again later.' }) },
            { Timestamp: new Date().toISOString(), Method: httpMethod, Path: path, ClientIP: clientIP, OrderNo: orderNo, TrackingNo: trackingNo, StatusCode: 500, Success: false, ErrorType: 'backend_unavailable', ResponseTimeMs: Date.now() - requestStart }
          );
        }
      }

      return await logAndReturn(
        { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'No record found. Please verify the tracking number.' }) },
        { Timestamp: new Date().toISOString(), Method: httpMethod, Path: path, ClientIP: clientIP, OrderNo: orderNo, TrackingNo: trackingNo, StatusCode: 404, Success: false, ErrorType: 'not_found', ResponseTimeMs: Date.now() - requestStart }
      );
    }

    if (path.includes('/api/tracking/timeline/')) {
      const trackingNo = path.split('/timeline/')[1];
      if (!trackingNo) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing trackingNo', message: 'Tracking number is required' }) };
      }
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'No timeline found for this tracking number.' }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found', message: 'API endpoint not found' }) };
  } catch (error) {
    console.error('Tracking API error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error', message: error.message }) };
  }
};

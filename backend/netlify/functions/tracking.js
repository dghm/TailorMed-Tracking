// Netlify Function for tracking API
// 處理 /api/tracking, /api/tracking-public, /api/health 等請求

// 本地開發時使用資料庫連接
let dbConnection = null;
let airtableConnection = null;

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
      console.log('✅ 已載入 .env 檔案:', envPath);
      console.log(
        '✅ AIRTABLE_API_KEY:',
        process.env.AIRTABLE_API_KEY ? 'SET' : 'NOT SET'
      );
      console.log(
        '✅ AIRTABLE_BASE_ID:',
        process.env.AIRTABLE_BASE_ID || 'NOT SET'
      );
      return;
    }
  }

  console.log('⚠️ 未找到 .env 檔案，嘗試的路徑:', envPaths);
}

// 初始化連接模組
function initConnections() {
  // 載入環境變數
  loadEnvVars();

  console.log('🔧 initConnections() - 環境變數狀態:');
  console.log(
    '  AIRTABLE_API_KEY:',
    process.env.AIRTABLE_API_KEY ? 'SET' : 'NOT SET'
  );
  console.log('  AIRTABLE_BASE_ID:', process.env.AIRTABLE_BASE_ID || 'NOT SET');
  console.log('  BACKEND_API_URL:', process.env.BACKEND_API_URL || 'NOT SET');

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
        console.log('✅ 已載入 Airtable 連接模組（直接 require）');
      } catch (requireError) {
        // 如果直接 require 失敗，嘗試使用完整路徑
        console.log('⚠️ 直接 require 失敗，嘗試使用完整路徑:', requireError.message);
        const localPath = path.join(__dirname, 'airtable.js');
        const fallbackPath = path.resolve(__dirname, '../../../database/airtable.js');
        
        if (fs.existsSync(localPath)) {
          // 清除緩存
          if (require.cache[localPath]) {
            delete require.cache[localPath];
          }
          airtableConnection = require(localPath);
          console.log('✅ 已載入 Airtable 連接模組（使用完整路徑）:', localPath);
        } else if (fs.existsSync(fallbackPath)) {
          if (require.cache[fallbackPath]) {
            delete require.cache[fallbackPath];
          }
          airtableConnection = require(fallbackPath);
          console.log('✅ 已載入 Airtable 連接模組（使用備用路徑）:', fallbackPath);
        } else {
          console.error('❌ 無法找到 airtable 模組，嘗試的路徑:');
          console.error('  - ./airtable (相對路徑)');
          console.error('  -', localPath);
          console.error('  -', fallbackPath);
          console.error('  - __dirname:', __dirname);
          throw new Error(`Cannot find airtable module. Checked: ./airtable, ${localPath}, ${fallbackPath}`);
        }
      }
      console.log('✅ 已載入 Airtable 連接模組');
      console.log(
        '✅ AIRTABLE_SHIPMENTS_TABLE:',
        process.env.AIRTABLE_SHIPMENTS_TABLE || 'NOT SET'
      );
      console.log('✅ airtableConnection 類型:', typeof airtableConnection);
      console.log(
        '✅ airtableConnection 函數:',
        Object.keys(airtableConnection)
      );
    } catch (error) {
      console.log('⚠️ Airtable 連接模組未找到:', error.message);
      console.log('⚠️ Error stack:', error.stack);
      airtableConnection = null; // 確保設為 null
    }
  } else {
    console.log('⚠️ 不滿足 Airtable 條件，跳過載入');
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
      console.log('✅ 已載入 MongoDB 連接模組');
    } catch (error) {
      console.log('⚠️ MongoDB 連接模組未找到，將使用 API 模式');
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
  console.log('🔍 Event path:', path);
  console.log('🔍 Event queryStringParameters:', queryStringParameters);

  try {
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
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Missing parameters',
            message: 'Both orderNo and trackingNo are required',
          }),
        };
      }

      console.log('🔍 Checking Airtable connection...');
      console.log(
        'airtableConnection:',
        airtableConnection ? 'SET' : 'NOT SET'
      );
      console.log(
        'AIRTABLE_API_KEY:',
        process.env.AIRTABLE_API_KEY
          ? 'SET (' + process.env.AIRTABLE_API_KEY.substring(0, 15) + '...)'
          : 'NOT SET'
      );
      console.log(
        'AIRTABLE_BASE_ID:',
        process.env.AIRTABLE_BASE_ID || 'NOT SET'
      );
      console.log(
        'AIRTABLE_SHIPMENTS_TABLE:',
        process.env.AIRTABLE_SHIPMENTS_TABLE || 'NOT SET'
      );
      console.log('BACKEND_API_URL:', process.env.BACKEND_API_URL || 'NOT SET');

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
            console.log('✅ 已載入 Airtable 連接模組（在 handler 中，直接 require）');
          } catch (requireError) {
            // 如果直接 require 失敗，嘗試使用完整路徑
            console.log('⚠️ 直接 require 失敗，嘗試使用完整路徑:', requireError.message);
            const localPath = path.join(__dirname, 'airtable.js');
            const fallbackPath = path.resolve(__dirname, '../../../database/airtable.js');
            
            if (fs.existsSync(localPath)) {
              // 清除緩存
              if (require.cache[localPath]) {
                delete require.cache[localPath];
              }
              airtableConnection = require(localPath);
              console.log('✅ 已載入 Airtable 連接模組（在 handler 中，使用完整路徑）:', localPath);
            } else if (fs.existsSync(fallbackPath)) {
              if (require.cache[fallbackPath]) {
                delete require.cache[fallbackPath];
              }
              airtableConnection = require(fallbackPath);
              console.log('✅ 已載入 Airtable 連接模組（在 handler 中，使用備用路徑）:', fallbackPath);
            } else {
              console.error('❌ 無法找到 airtable 模組，嘗試的路徑:');
              console.error('  - ./airtable (相對路徑)');
              console.error('  -', localPath);
              console.error('  -', fallbackPath);
              console.error('  - __dirname:', __dirname);
              throw new Error(`Cannot find airtable module. Checked: ./airtable, ${localPath}, ${fallbackPath}`);
            }
          }
          console.log('✅ 已載入 Airtable 連接模組（在 handler 中）');
        } catch (error) {
          console.log('⚠️ Airtable 連接模組載入失敗:', error.message);
          console.log('⚠️ Error stack:', error.stack);
        }
      }

      // 檢查條件
      const hasAirtableConfig =
        process.env.AIRTABLE_API_KEY &&
        process.env.AIRTABLE_BASE_ID &&
        !process.env.BACKEND_API_URL;
      console.log('hasAirtableConfig:', hasAirtableConfig);
      console.log(
        'airtableConnection after check:',
        airtableConnection ? 'SET' : 'NOT SET'
      );

      if (airtableConnection && hasAirtableConfig) {
        try {
          console.log('✅ Using Airtable connection');
          console.log('🔍 Querying:', orderNo, trackingNo);
          const { findShipment, findTimeline } = airtableConnection;

          // 查詢貨件資料
          let shipment;
          try {
            shipment = await findShipment(orderNo, trackingNo);
            console.log(
              '📦 Shipment result:',
              shipment ? 'Found' : 'Not found'
            );
            if (shipment) {
              console.log('📦 Shipment details:', {
                orderNo: shipment.orderNo,
                trackingNo: shipment.trackingNo,
                origin: shipment.origin,
                destination: shipment.destination,
              });
            }
          } catch (queryError) {
            console.error('❌ Airtable query error:', queryError);
            console.error('❌ Error stack:', queryError.stack);
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({
                success: false,
                error: 'Airtable query failed',
                message: queryError.message,
              }),
            };
          }

          if (!shipment) {
            console.log('⚠️ No shipment found for:', orderNo, trackingNo);
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({
                success: false,
                message: 'No record found. Please verify the tracking number.',
              }),
            };
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

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify(responseData),
          };
        } catch (error) {
          console.error('Airtable query error:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Airtable query failed',
              message: error.message,
            }),
          };
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
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({
                success: false,
                message: 'No record found. Please verify the tracking number.',
              }),
            };
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

      return {
        statusCode: 200,
        headers,
            body: JSON.stringify(responseData),
          };
        } catch (error) {
          console.error('Database query error:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Database query failed',
              message: error.message,
            }),
          };
        }
      }

      // 連接後端 API（如果已設定環境變數）
      const backendApiUrl = process.env.BACKEND_API_URL;

      if (backendApiUrl) {
        try {
          // 構建後端 API URL
          const apiKey =
            queryStringParameters?.apiKey || process.env.BACKEND_API_KEY;
          let backendUrl = `${backendApiUrl}/api/tracking?orderNo=${encodeURIComponent(
            orderNo
          )}&trackingNo=${encodeURIComponent(trackingNo)}`;

          if (apiKey) {
            backendUrl += `&apiKey=${encodeURIComponent(apiKey)}`;
          }

          // 呼叫後端 API
          const backendResponse = await fetch(backendUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...(process.env.BACKEND_API_KEY && {
                Authorization: `Bearer ${process.env.BACKEND_API_KEY}`,
              }),
            },
          });

          if (!backendResponse.ok) {
            if (backendResponse.status === 404) {
              return {
                statusCode: 404,
                headers,
                body: JSON.stringify({
                  success: false,
                  message:
                    'No record found. Please verify the tracking number.',
                }),
              };
            }

            if (backendResponse.status === 429) {
              const errorData = await backendResponse.json().catch(() => ({}));
              return {
                statusCode: 429,
                headers,
                body: JSON.stringify({
                  success: false,
                  message:
                    errorData.message ||
                    'Query limit reached (10 per hour). Please try again later.',
                }),
              };
            }

            throw new Error(
              `Backend API returned status ${backendResponse.status}`
            );
          }

          const backendData = await backendResponse.json();

          // 確保返回格式一致
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              data: backendData.data || backendData,
            }),
          };
        } catch (error) {
          console.error('Backend API error:', error);

          // 如果後端 API 失敗，返回錯誤（不返回 mock 資料）
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Backend service unavailable',
              message:
                'Unable to connect to backend service. Please try again later.',
            }),
          };
        }
      }

      // 如果沒有設定任何資料來源，返回錯誤
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'No record found. Please verify the tracking number.',
        }),
      };
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

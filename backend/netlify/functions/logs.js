/**
 * Netlify Function: /api/logs
 * 讀取 Airtable TrackingLogs，供 Dashboard 顯示真實查詢記錄
 */

const Airtable = require('airtable');

const DASHBOARD_KEY = process.env.DASHBOARD_KEY;
const TABLE_NAME = process.env.AIRTABLE_LOGS_TABLE || 'TrackingLogs';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Dashboard-Key',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function json(statusCode, body) {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  // 密碼保護（如果有設定 DASHBOARD_KEY）
  if (DASHBOARD_KEY) {
    const provided =
      event.headers?.['x-dashboard-key'] ||
      event.queryStringParameters?.dashboardKey;
    if (provided !== DASHBOARD_KEY) {
      return json(401, { success: false, error: 'Unauthorized' });
    }
  }

  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
    return json(500, { success: false, error: 'Airtable not configured' });
  }

  try {
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
      process.env.AIRTABLE_BASE_ID
    );

    const { dateRange = 'week', status = 'all', pageSize = '100', offset } =
      event.queryStringParameters || {};

    // 建立日期過濾條件
    let filterParts = [];
    const now = new Date();

    if (dateRange === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      filterParts.push(`IS_AFTER({Timestamp}, '${start}')`);
    } else if (dateRange === 'week') {
      const start = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      filterParts.push(`IS_AFTER({Timestamp}, '${start}')`);
    } else if (dateRange === 'month') {
      const start = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
      filterParts.push(`IS_AFTER({Timestamp}, '${start}')`);
    }

    if (status === 'success') {
      filterParts.push(`{Success} = TRUE()`);
    } else if (status === 'error') {
      filterParts.push(`{Success} = FALSE()`);
    }

    const filterByFormula =
      filterParts.length > 1
        ? `AND(${filterParts.join(', ')})`
        : filterParts[0] || '';

    const queryOptions = {
      sort: [{ field: 'Timestamp', direction: 'desc' }],
      maxRecords: parseInt(pageSize, 10),
      fields: [
        'Timestamp', 'Method', 'OrderNo', 'TrackingNo',
        'StatusCode', 'Success', 'ResponseTimeMs',
        'ErrorType', 'ErrorMessage', 'ClientIP', 'Path',
      ],
    };
    if (filterByFormula) queryOptions.filterByFormula = filterByFormula;
    if (offset) queryOptions.offset = offset;

    const records = [];
    let nextOffset = null;

    await new Promise((resolve, reject) => {
      base(TABLE_NAME)
        .select(queryOptions)
        .eachPage(
          (page, fetchNextPage) => {
            page.forEach((record) => {
              records.push({ id: record.id, ...record.fields });
            });
            // 只取第一頁
            nextOffset = page.length === parseInt(pageSize, 10) ? 'has_more' : null;
            resolve();
          },
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
    });

    return json(200, {
      success: true,
      records,
      total: records.length,
      nextOffset,
    });
  } catch (error) {
    console.error('logs function error:', error.message);
    return json(500, { success: false, error: error.message });
  }
};

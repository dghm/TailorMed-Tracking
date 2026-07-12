/**
 * Netlify Function: /api/logs
 * 從 Netlify Blob 讀取查詢記錄，供 Dashboard 顯示
 */

const { getStore } = require('@netlify/blobs');

const DASHBOARD_KEY = process.env.DASHBOARD_KEY;

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

// 產生日期 key 列表（從 N 天前到今天）
function dateKeys(days) {
  const keys = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(`tracking-logs/${d.toISOString().slice(0, 10)}`);
  }
  return keys;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (DASHBOARD_KEY) {
    const provided =
      event.headers?.['x-dashboard-key'] ||
      event.queryStringParameters?.dashboardKey;
    if (provided !== DASHBOARD_KEY) {
      return json(401, { success: false, error: 'Unauthorized' });
    }
  }

  try {
    const { dateRange = 'week', status = 'all' } =
      event.queryStringParameters || {};

    const daysToFetch =
      dateRange === 'today' ? 1 : dateRange === 'week' ? 7 : 30;

    const store = getStore('tracking-logs');
    const keys = dateKeys(daysToFetch);

    // 並行讀取所有日期的 Blob
    const results = await Promise.all(
      keys.map((key) => store.get(key, { type: 'json' }).catch(() => []))
    );

    let records = results
      .flat()
      .filter(Boolean)
      .sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));

    if (status === 'success') {
      records = records.filter((r) => r.Success);
    } else if (status === 'error') {
      records = records.filter((r) => !r.Success);
    }

    return json(200, { success: true, records, total: records.length });
  } catch (error) {
    console.error('logs function error:', error.message);
    return json(500, { success: false, error: error.message });
  }
};

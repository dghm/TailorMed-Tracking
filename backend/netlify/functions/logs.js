/**
 * Netlify Function: /api/logs
 * Monitor 功能暫時停用，回傳空資料避免 500 錯誤
 */

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

  // Monitor 功能暫時停用
  return json(200, { success: true, records: [], total: 0, message: 'Monitor 功能暫時停用' });
};

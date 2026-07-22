/**
 * Netlify Function: /api/logs
 * 從 Airtable TrackingLogs 表讀取查詢記錄，供 Dashboard 顯示
 */

const Airtable = require('airtable');

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

  try {
    const { dateRange = 'week', status = 'all' } =
      event.queryStringParameters || {};

    const daysToFetch =
      dateRange === 'today' ? 1 : dateRange === 'week' ? 7 : 30;

    const since = new Date();
    since.setDate(since.getDate() - daysToFetch + 1);
    since.setHours(0, 0, 0, 0);

    let filterFormula = `IS_AFTER({Timestamp}, '${since.toISOString()}')`;
    if (status === 'success') {
      filterFormula = `AND(${filterFormula}, {Success} = 'true')`;
    } else if (status === 'error') {
      filterFormula = `AND(${filterFormula}, {Success} = 'false')`;
    }

    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
      process.env.AIRTABLE_BASE_ID
    );

    const records = await new Promise((resolve, reject) => {
      const all = [];
      base('TrackingLogs')
        .select({
          filterByFormula: filterFormula,
          sort: [{ field: 'Timestamp', direction: 'desc' }],
          maxRecords: 500,
          fields: [
            'Timestamp', 'OrderNo', 'TrackingNo', 'StatusCode', 'Success',
            'ErrorType', 'ErrorMessage', 'ResponseTimeMs',
            'ClientIP', 'UserAgent', 'ApiKeyUsed', 'ApiKeyValid',
            'Method', 'Path',
          ],
        })
        .eachPage(
          (page, next) => { all.push(...page); next(); },
          (err) => (err ? reject(err) : resolve(all))
        );
    });

    const formatted = records.map((r) => ({
      Timestamp: r.get('Timestamp'),
      OrderNo: r.get('OrderNo') || '',
      TrackingNo: r.get('TrackingNo') || '',
      StatusCode: parseInt(r.get('StatusCode')) || 0,
      Success: r.get('Success') === 'true',
      ErrorType: r.get('ErrorType') || '',
      ErrorMessage: r.get('ErrorMessage') || '',
      ResponseTimeMs: parseInt(r.get('ResponseTimeMs')) || 0,
      ClientIP: r.get('ClientIP') || '',
      UserAgent: r.get('UserAgent') || '',
      ApiKeyUsed: r.get('ApiKeyUsed') === 'true',
      ApiKeyValid: r.get('ApiKeyValid') === 'true',
      Method: r.get('Method') || 'GET',
      Path: r.get('Path') || '',
    }));

    return json(200, { success: true, records: formatted, total: formatted.length });
  } catch (error) {
    console.error('logs function error:', error.message);
    return json(500, { success: false, error: error.message });
  }
};

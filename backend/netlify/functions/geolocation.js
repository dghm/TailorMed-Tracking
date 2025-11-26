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

// 使用免費的 IP 地理位置 API 獲取位置信息
async function getLocationFromIP(ip) {
  // 如果是本地 IP 或 unknown，返回默認值
  if (!ip || ip === 'unknown' || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return {
      country: 'Local',
      region: 'Development',
      city: 'Local',
      countryCode: 'LOCAL',
      ip: ip,
    };
  }

  try {
    // 使用 ip-api.com (免費，每分鐘 45 次請求)
    // 格式：http://ip-api.com/json/{ip}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // 設定超時
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      throw new Error(`IP API returned ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'success') {
      return {
        country: data.country || 'Unknown',
        region: data.regionName || data.region || 'Unknown',
        city: data.city || 'Unknown',
        countryCode: data.countryCode || 'XX',
        latitude: data.lat,
        longitude: data.lon,
        timezone: data.timezone,
        isp: data.isp,
        ip: ip,
      };
    } else {
      // API 返回失敗
      return {
        country: 'Unknown',
        region: 'Unknown',
        city: 'Unknown',
        countryCode: 'XX',
        ip: ip,
        error: data.message || 'Failed to get location',
      };
    }
  } catch (error) {
    console.error('Failed to get location from IP:', error);
    // 如果 API 失敗，返回基本信息
    return {
      country: 'Unknown',
      region: 'Unknown',
      city: 'Unknown',
      countryCode: 'XX',
      ip: ip,
      error: error.message,
    };
  }
}

// 組合函數：獲取 IP 和地理位置
async function getClientLocation(event) {
  const ip = getClientIP(event);
  const location = await getLocationFromIP(ip);
  
  return {
    ip: ip,
    ...location,
  };
}

module.exports = {
  getClientIP,
  getLocationFromIP,
  getClientLocation,
};



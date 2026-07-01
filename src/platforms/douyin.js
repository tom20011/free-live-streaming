import { UA, extractCookies } from '../utils.js';

function parseUA(ua) {
  if (!ua) return {};
  const result = { browser_name: '', browser_version: '', os_name: '', os_version: '', browser_platform: '' };

  if (/Windows/i.test(ua)) {
    result.os_name = 'Windows';
    const m = ua.match(/Windows NT ([\d.]+)/);
    if (m) {
      const v = { '10.0': '10', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.2': 'XP', '5.1': 'XP' };
      result.os_version = v[m[1]] || m[1];
    }
  } else if (/Mac OS X/i.test(ua)) {
    result.os_name = 'macOS';
    const m = ua.match(/Mac OS X (\S+)/);
    if (m) result.os_version = m[1].replace(/_/g, '.');
  } else if (/Android/i.test(ua)) {
    result.os_name = 'Android';
    const m = ua.match(/Android (\S+)/);
    if (m) result.os_version = m[1];
  } else if (/iPhone|iPad|iOS/i.test(ua)) {
    result.os_name = 'iOS';
    const m = ua.match(/OS (\d+[_\d]*)/);
    if (m) result.os_version = m[1].replace(/_/g, '.');
  } else if (/Linux/i.test(ua)) {
    result.os_name = 'Linux';
  }

  if (/Win32|Win64/i.test(ua)) result.browser_platform = 'Win32';
  else if (/MacIntel|MacPPC/i.test(ua)) result.browser_platform = 'MacIntel';
  else if (/Linux x86_64/i.test(ua)) result.browser_platform = 'Linux x86_64';
  else if (/Linux armv/i.test(ua)) result.browser_platform = 'Linux armv';
  else result.browser_platform = ua.match(/\(([^;]+)/)?.[1] || '';

  const edgeM = ua.match(/Edg\/(\S+)/i);
  if (edgeM) {
    result.browser_name = 'Edge';
    result.browser_version = edgeM[1];
    return result;
  }
  const oprM = ua.match(/OPR\/(\S+)/i);
  if (oprM) {
    result.browser_name = 'Opera';
    result.browser_version = oprM[1];
    return result;
  }
  if (/Brave/i.test(ua)) {
    result.browser_name = 'Brave';
    const m = ua.match(/Chrome\/(\S+)/);
    if (m) result.browser_version = m[1];
    return result;
  }
  const ffM = ua.match(/Firefox\/(\S+)/i);
  if (ffM) {
    result.browser_name = 'Firefox';
    result.browser_version = ffM[1];
    return result;
  }
  const safariM = ua.match(/Safari\/(\S+)/i);
  const versionM = ua.match(/Version\/(\S+)/i);
  if (safariM && versionM) {
    result.browser_name = 'Safari';
    result.browser_version = versionM[1];
    return result;
  }
  const chromeM = ua.match(/Chrome\/(\S+)/i);
  if (chromeM) {
    result.browser_name = 'Chrome';
    result.browser_version = chromeM[1];
  }

  return result;
}

function generateLiveUrl(roomId) {
  const uaInfo = parseUA(UA);

  const params = {
    aid: '6383',
    app_name: 'douyin_web',
    live_id: '1',
    device_platform: 'web',
    language: 'zh-CN',
    enter_from: 'link_share',
    cookie_enabled: 'true',
    screen_width: '1680',
    screen_height: '1050',
    browser_language: 'zh-CN',
    browser_platform: uaInfo.browser_platform || 'Win32',
    browser_name: uaInfo.browser_name || '',
    browser_version: uaInfo.browser_version || '',
    os_name: uaInfo.os_name || '',
    os_version: uaInfo.os_version || '',
    web_rid: roomId,
    enter_source: '',
    is_need_double_stream: 'false',
    insert_task_id: '',
    live_reason: '',
  };

  return 'https://live.douyin.com/webcast/room/web/enter/?' + new URLSearchParams(params);
}

async function fetchCookies(pageUrl) {
  const res = await fetch(pageUrl, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
  });
  if (!res.ok) throw new Error('No cookie received');
  const cookieStr = extractCookies(res);
  if (!cookieStr) throw new Error('No cookie received');
  return cookieStr;
}

async function httpGet(url, cookie) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Referer': 'https://live.douyin.com/',
      'Accept': 'application/json, text/plain, */*',
      'Cookie': cookie,
    },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  if (!text) throw new Error('Empty response');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Invalid JSON response from API');
  }
}

export async function getStreamUrl(roomId) {
  const liveUrl = 'https://live.douyin.com/' + roomId;
  const apiUrl = generateLiveUrl(roomId);
  const cookies = await fetchCookies(liveUrl);
  const json = await httpGet(apiUrl, cookies);
  if (json.status_code !== 0) throw new Error('API error: ' + json.status_code);

  const streamUrl = json?.data?.data?.[0]?.stream_url;
  if (!streamUrl) return '';

  const priorities = ['FULL_HD1', 'HD1', 'SD1', 'SD2'];
  for (const key of priorities) {
    const hls = streamUrl.hls_pull_url_map?.[key];
    if (hls) return hls;
    const flv = streamUrl.flv_pull_url?.[key];
    if (flv) return flv;
  }
  return '';
}

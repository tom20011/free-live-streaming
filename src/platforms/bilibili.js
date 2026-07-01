import { UA, extractCookies } from '../utils.js';

function generateBuvid3() {
  const hex = '0123456789ABCDEF';
  const rand = (n) => Array.from({ length: n }, () => hex[Math.floor(Math.random() * 16)]).join('');
  return 'XZ' + rand(15) + '-' + rand(4) + '-4' + rand(3) + '-' + rand(4) + '-' + rand(12) + 'infoc';
}

export async function getBilibiliStreamUrl(roomId, useBackupCdn) {
  const cookieRes = await fetch('https://live.bilibili.com/' + roomId, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
  });
  let cookieStr = extractCookies(cookieRes);
  let buvid3 = cookieStr.match(/buvid3=([^;]+)/)?.[1];
  if (!buvid3) { buvid3 = generateBuvid3(); cookieStr = 'buvid3=' + buvid3 + ';'; }

  const params = new URLSearchParams({
    room_id: roomId,
    protocol: '0,1',
    format: '0,1,2',
    codec: '0,1',
    qn: '10000',
    platform: 'web',
    ptype: '8',
  });
  const apiUrl = 'https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?' + params;

  const apiRes = await fetch(apiUrl, {
    headers: {
      'User-Agent': UA,
      'Referer': 'https://live.bilibili.com/' + roomId,
      'Accept': 'application/json, text/plain, */*',
      'Cookie': cookieStr,
    },
  });
  if (!apiRes.ok) throw new Error('Bilibili HTTP ' + apiRes.status);

  const json = await apiRes.json();
  if (json.code !== 0) throw new Error('Bilibili API error: ' + json.code + ' ' + json.message);

  const playurl = json.data?.playurl_info?.playurl;
  if (!playurl) throw new Error('No playurl in response');

  const streams = playurl.stream || [];
  if (streams.length === 0) throw new Error('No streams available');

  const pickUrlInfo = (urlInfo) => useBackupCdn ? urlInfo?.[1] : (urlInfo?.[1] || urlInfo?.[0]);

  const qnPriority = ['30000', '20000', '15000', '10000', '400', '250', '150', '80'];
  for (const protocol of ['http_stream', 'http_hls']) {
    const stream = streams.find(s => s.protocol_name === protocol);
    if (!stream) continue;
    for (const format of (stream.format || [])) {
      for (const codec of (format.codec || [])) {
        for (const targetQn of qnPriority) {
          if (!codec.accept_qn?.includes(Number(targetQn))) continue;
          const urlInfo = pickUrlInfo(codec.url_info);
          if (urlInfo) return urlInfo.host + codec.base_url + urlInfo.extra;
        }
        const urlInfo = pickUrlInfo(codec.url_info);
        if (urlInfo) return urlInfo.host + codec.base_url + urlInfo.extra;
      }
    }
  }

  throw new Error('No playable stream URL found');
}

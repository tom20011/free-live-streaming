import { UA, extractCookies } from '../utils.js';

const PANDALIVE_HEADERS = {
  'X-Device-Info': '{"t":"webPc","v":"1.0","ui":"0","ck":{"sessKeyAsp":""}}',
  'Accept-Language': 'ko',
  'Origin': 'https://www.pandalive.co.kr',
};

export async function getPandaliveStreamUrl(roomId) {
  const body = `userId=${encodeURIComponent(roomId)}&action=watch`;

  async function doPlay(cookieStr) {
    const headers = {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'Accept': '*/*',
      'Referer': 'https://www.pandalive.co.kr/',
      ...PANDALIVE_HEADERS,
    };
    if (cookieStr) headers['Cookie'] = cookieStr;

    return fetch('https://api.pandalive.co.kr/v1/live/play', {
      method: 'POST', headers, body,
    });
  }

  const firstRes = await doPlay();
  const cookieStr = extractCookies(firstRes);

  const playRes = cookieStr ? await doPlay(cookieStr) : firstRes;
  const playBody = await playRes.text();
  if (!playRes.ok) throw new Error('pandalive play failed: HTTP ' + playRes.status);
  let playJson;
  try { playJson = JSON.parse(playBody); } catch (e) { throw new Error('pandalive parse error: ' + playBody); }
  if (!playJson.result) {
    const code = playJson?.errorData?.code;
    if (code === 'needAdult') throw new Error('pandalive: adult verification required for this room');
    if (code === 'castEnd') throw new Error('pandalive: broadcast has ended');
    throw new Error('pandalive play failed: ' + (playJson.message || 'unknown error'));
  }

  const playbackUrl = playJson?.PlayList?.hls?.[0]?.url;
  if (!playbackUrl) throw new Error('No stream URL in play response');

  const m3u8Res = await fetch(playbackUrl, {
    headers: {
      'Origin': 'https://www.pandalive.co.kr',
      'User-Agent': UA,
      'Accept': '*/*',
      'Referer': 'https://www.pandalive.co.kr/',
    },
  });
  if (!m3u8Res.ok) throw new Error('Failed to fetch IVS playback m3u8: ' + m3u8Res.status);
  const m3u8Text = await m3u8Res.text();

  let bestUrl = '';
  let bestHeight = 0;
  const lines = m3u8Text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      const resolutionMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
      const height = resolutionMatch ? parseInt(resolutionMatch[2], 10) : 0;
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
      if (nextLine && !nextLine.startsWith('#') && height >= bestHeight) {
        bestUrl = nextLine;
        bestHeight = height;
      }
    }
  }

  if (!bestUrl) throw new Error('No playlist URL found in IVS m3u8');
  return bestUrl;
}

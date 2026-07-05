import md5 from 'blueimp-md5';
import { UA } from '../utils.js';

function extractBraceBlock(str, startPos) {
  let i = startPos;
  if (str[i] !== '{') throw new Error('Expected { at position ' + startPos);
  let depth = 0, inStr = false, esc = false;

  while (i < str.length) {
    const ch = str[i];
    if (esc) { esc = false; i++; continue; }
    if (ch === '\\' && inStr) { esc = true; i++; continue; }
    if ((ch === '"' || ch === "'") && !inStr) { inStr = ch; i++; continue; }
    if (inStr === ch) { inStr = false; i++; continue; }
    if (!inStr) {
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) break; }
    }
    i++;
  }

  if (depth !== 0) throw new Error('Unmatched braces');
  return str.substring(startPos, i + 1);
}

function skipWhitespace(str, pos) {
  while (pos < str.length && (str[pos] === ' ' || str[pos] === '\t' || str[pos] === '\n' || str[pos] === '\r')) pos++;
  return pos;
}

function _buildHuyaUrl(streamUrl, sStreamName, streamSuffix, antiCode, uid) {
  streamUrl = streamUrl.replace(/^http:/, 'https:');
  const ac = antiCode.replace(/&amp;/g, '&');
  const acParams = new URLSearchParams(ac);
  const wsTime = acParams.get('wsTime');
  const fmEncoded = acParams.get('fm');
  if (!wsTime || !fmEncoded) throw new Error('Missing wsTime or fm in anticode');

  const fm = atob(decodeURIComponent(fmEncoded));
  const ctype = 'tars_mobile';
  const t = '103';
  const seqid = Number(uid) + Date.now();
  const s = md5(seqid + '|' + ctype + '|' + t);

  const replacedFm = fm
    .replace(/\$0/g, '' + uid)
    .replace(/\$1/g, sStreamName)
    .replace(/\$2/g, s)
    .replace(/\$3/g, wsTime);
  const wsSecret = md5(replacedFm);

  return `${streamUrl}/${sStreamName}.${streamSuffix}?wsSecret=${wsSecret}&wsTime=${wsTime}&seqid=${seqid}&ctype=${ctype}&ver=1&t=${t}&uid=${uid}&fs=bgct`;
}

function _pickStreamInfo(streamData, useFlv) {
  const gameLiveInfo = streamData?.data?.[0]?.gameLiveInfo;
  const gameStreamInfoList = streamData?.data?.[0]?.gameStreamInfoList;
  if (!gameLiveInfo || !gameStreamInfoList?.length) return null;
  const hasBitRate = gameStreamInfoList.some(item => item.iBitRate);
  const streamInfo = hasBitRate
    ? gameStreamInfoList.reduce((a, b) => (b.iBitRate || 0) > (a.iBitRate || 0) ? b : a)
    : gameStreamInfoList[gameStreamInfoList.length - 1];

  const streamUrl = useFlv ? streamInfo.sFlvUrl : streamInfo.sHlsUrl;
  const streamSuffix = useFlv ? streamInfo.sFlvUrlSuffix : streamInfo.sHlsUrlSuffix;
  const { sStreamName, sHlsAntiCode, sFlvAntiCode } = streamInfo;
  const uid = gameLiveInfo.uid;
  const antiCode = useFlv ? (sFlvAntiCode || sHlsAntiCode) : sHlsAntiCode;

  if (!streamUrl || !sStreamName || !streamSuffix || !antiCode || !uid) return null;
  return { streamUrl, sStreamName, streamSuffix, antiCode, uid, profileRoom: gameLiveInfo.profileRoom };
}

async function _getHuyaStreamUrlFromApi(roomId, useFlv) {
  const res = await fetch('https://mp.huya.com/cache.php?m=Live&do=profileRoom&roomid=' + roomId, {
    headers: { 'User-Agent': UA, 'Referer': 'https://huya.com/' },
  });
  if (!res.ok) throw new Error('Huya API HTTP ' + res.status);
  const json = await res.json();

  const d = json?.data;
  if (!d) throw new Error('No data from API');

  const list = d?.stream?.baseSteamInfoList;
  if (list?.length) {
    const hasBitRate = list.some(item => item.iBitRate);
    const info = hasBitRate
      ? list.reduce((a, b) => (b.iBitRate || 0) > (a.iBitRate || 0) ? b : a)
      : list[list.length - 1];
    let streamUrl = useFlv ? info.sFlvUrl : info.sHlsUrl;
    streamUrl = streamUrl.replace(/^http:/, 'https:');
    const streamSuffix = useFlv ? info.sFlvUrlSuffix : info.sHlsUrlSuffix;
    const sStreamName = info.sStreamName;
    const antiCode = useFlv ? (info.sFlvAntiCode || info.sHlsAntiCode) : info.sHlsAntiCode;
    const uid = d?.profileInfo?.uid || d?.liveData?.uid;
    if (!streamUrl || !sStreamName || !streamSuffix || !antiCode || !uid) throw new Error('Incomplete stream info from API');
    return _buildHuyaUrl(streamUrl, sStreamName, streamSuffix, antiCode, uid);
  }

  if (d?.liveData?.hls) {
    const hlsUrl = d.liveData.hls.replace(/^http:/, 'https:');
    try {
      const m3u8Res = await fetch(hlsUrl, {
        headers: { 'User-Agent': UA, 'Referer': 'https://huya.com/' },
      });
      if (m3u8Res.ok) {
        const m3u8Text = await m3u8Res.text();
        let bestUrl = '', bestHeight = 0;
        const lines = m3u8Text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('#EXT-X-STREAM-INF')) {
            const m = line.match(/RESOLUTION=(\d+)x(\d+)/);
            const h = m ? parseInt(m[2], 10) : 0;
            const next = i + 1 < lines.length ? lines[i + 1].trim() : '';
            if (next && !next.startsWith('#') && h >= bestHeight) {
              bestUrl = next.startsWith('http') ? next : new URL(next, hlsUrl).href;
              bestHeight = h;
            }
          }
        }
        if (bestUrl) return bestUrl;
      }
    } catch (_) { /* fallback to original hlsUrl */ }
    return hlsUrl;
  }

  throw new Error('No stream data from API (room may be offline)');
}

async function _getHuyaStreamUrl(roomId, useFlv) {
  const res = await fetch('https://huya.com/' + roomId, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
  });
  if (!res.ok) throw new Error('No stream data from API (room may be offline)');
  const html = await res.text();

  const configRe = /(?:var|window\.)\s*hyPlayerConfig\s*=\s*\{/;
  const configMatch = html.match(configRe);
  if (!configMatch) throw new Error('Could not find hyPlayerConfig');

  const configBlock = extractBraceBlock(html, configMatch.index + configMatch[0].length - 1);

  const streamKeyRe = /stream\s*:/;
  const streamKeyMatch = configBlock.match(streamKeyRe);
  if (!streamKeyMatch) throw new Error('Could not find stream property');
  let pos = skipWhitespace(configBlock, streamKeyMatch.index + streamKeyMatch[0].length);
  const streamStr = extractBraceBlock(configBlock, pos);
  const streamData = JSON.parse(streamStr);

  const info = _pickStreamInfo(streamData, useFlv);
  if (info) return _buildHuyaUrl(info.streamUrl, info.sStreamName, info.streamSuffix, info.antiCode, info.uid);

  const profileRoom = streamData?.data?.[0]?.gameLiveInfo?.profileRoom;
  if (profileRoom) return _getHuyaStreamUrlFromApi(profileRoom, useFlv);

  throw new Error('No stream data available (room may be offline)');
}

export async function getHuyaFlvStreamUrl(roomId) {
  return _getHuyaStreamUrl(roomId, true);
}

export async function getHuyaHlsStreamUrl(roomId) {
  return _getHuyaStreamUrl(roomId, false);
}

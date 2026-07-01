import md5 from 'blueimp-md5';
import { UA } from '../utils.js';

const STATIC_DID = '3681fbf52f309916b9b1449300081701';

async function getDouyuKey(did) {
  const res = await fetch('https://www.douyu.com/wgapi/livenc/liveweb/websec/getEncryption?did=' + did, {
    headers: { 'User-Agent': UA, 'Referer': 'https://www.douyu.com/' },
  });
  if (!res.ok) throw new Error('Key error: HTTP ' + res.status);
  const json = await res.json();
  if (json.error !== 0) throw new Error('Key error: ' + json.msg);
  return json.data;
}

function computeAuth(randStr, key, roomId, ts) {
  return md5(md5(randStr + key) + key + roomId + ts);
}

async function getDouyuPlayInfo(roomId, did, encData, auth, ts) {
  const body = new URLSearchParams({
    enc_data: encData,
    tt: '' + ts,
    did: did,
    auth: auth,
    cdn: '',
    ver: 'Douyu_new',
    rate: '-1',
    hevc: '1',
    fa: '0',
    ive: '0',
  });
  const res = await fetch('https://www.douyu.com/lapi/live/getH5PlayV1/' + roomId, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Referer': 'https://www.douyu.com/',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error('Play error: HTTP ' + res.status);
  const json = await res.json();
  if (json.error !== 0) throw new Error('Play error: ' + json.msg);
  return json.data;
}

function buildDouyuFlvUrl(data) {
  if (!data.rtmp_url || !data.rtmp_live) return '';
  return data.rtmp_url + '/' + data.rtmp_live;
}

function buildDouyuHlsUrl(data) {
  const cdn = data.cdnsWithName?.find(c => c.cdn && c.cdn.includes('h5'));
  if (!cdn) return null;
  const prefix = cdn.cdn?.replace(/-h5$/, '');
  const txTime = data.p2pMeta?.xp2p_txTime;
  const props = data.p2pMeta?.stream_props;
  if (!prefix || !txTime || !props?.length) return null;
  const flvQs = data.rtmp_live?.split('?')?.[1];
  if (!flvQs) return null;
  const sp = new URLSearchParams(flvQs);
  const token = sp.get('token');
  const sid = sp.get('sid');
  if (!token || !sid) return null;
  if (props.length > 0) {
    const prop = props[0];
    return 'http://openhls-' + prefix + '.douyucdn2.cn/live/' + prop.sid + '.m3u8?txSecret=' + prop.txSecret + '&txTime=' + txTime + '&token=' + token + '&did=' + STATIC_DID + '&origin=dy&vhost=play2&sid=' + sid + '&mcid2=0';
  }
  return null;
}

export async function getDouyuStreamUrl(roomId, useHls) {
  const keyData = await getDouyuKey(STATIC_DID);
  const encData = keyData.enc_data;
  const randStr = keyData.rand_str;
  const key = keyData.key;
  const ts = Math.floor(Date.now() / 1000);
  const auth = computeAuth(randStr, key, roomId, ts);
  const playInfo = await getDouyuPlayInfo(roomId, STATIC_DID, encData, auth, ts);

  if (!useHls) {
    return buildDouyuFlvUrl(playInfo);
  } else {
    const hlsUrl = buildDouyuHlsUrl(playInfo);
    if (hlsUrl) return hlsUrl;

    const flvUrl = buildDouyuFlvUrl(playInfo);
    if (flvUrl) return flvUrl;

    return '';
  }
}

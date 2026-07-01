import { getStreamUrl } from './platforms/douyin.js';
import { getDouyuStreamUrl } from './platforms/douyu.js';
import { getBilibiliStreamUrl } from './platforms/bilibili.js';
import { getHuyaFlvStreamUrl, getHuyaHlsStreamUrl } from './platforms/huya.js';
import { getPandaliveStreamUrl } from './platforms/pandalive.js';
import { getTwitchStreamUrl } from './platforms/twitch.js';

const platforms = ['douyin', 'douyu', 'bilibili', 'huya', 'pandalive', 'twitch'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts.length !== 2) {
      return new Response('Usage: GET /<platform>/<roomId>', { status: 400, headers: corsHeaders });
    }

    const [platform, roomId] = parts;

    if (!platforms.includes(platform)) {
      return new Response('Unsupported platform: ' + platform, { status: 404, headers: corsHeaders });
    }

    if (platform === 'twitch') {
      if (!/^[\w-]+$/.test(roomId)) {
        return new Response('Usage: GET /twitch/<channelName>', { status: 400, headers: corsHeaders });
      }
    } else if (platform === 'huya' || platform === 'pandalive') {
    } else if (!/^\d+$/.test(roomId)) {
      return new Response('Usage: GET /<platform>/<roomId>', { status: 400, headers: corsHeaders });
    }

    try {
      let streamUrl;
      if (platform === 'douyin') {
        streamUrl = await getStreamUrl(roomId);
      } else if (platform === 'douyu') {
        streamUrl = await getDouyuStreamUrl(roomId, env.DOUYU_USE_HLS === 'true');
      } else if (platform === 'bilibili') {
        streamUrl = await getBilibiliStreamUrl(roomId, env.BILI_USE_BACKUP_CDN !== 'false');
      } else if (platform === 'huya') {
        streamUrl = env.HUYA_USE_FLV !== 'false' ? await getHuyaFlvStreamUrl(roomId) : await getHuyaHlsStreamUrl(roomId);
      } else if (platform === 'pandalive') {
        streamUrl = await getPandaliveStreamUrl(roomId);
      } else if (platform === 'twitch') {
        streamUrl = await getTwitchStreamUrl(roomId);
      }
      if (!streamUrl) {
        return new Response('live is offline', { status: 404, headers: corsHeaders });
      }
      return new Response(null, {
        status: 302,
        headers: {
          Location: streamUrl,
          ...corsHeaders,
        },
      });
    } catch (e) {
      const expectedErrors = [
        'room may be offline',
        'broadcast has ended',
        'adult verification required',
        'No playable stream URL found',
        'No streams available',
        'No stream URL in play response',
        'No playlist URL found in IVS m3u8',
        'No data from API',
        'Incomplete stream info from API',
        'API error:',
        'Play error:',
        'Bilibili API error:',
        'No playurl in response',
        'pandalive play failed:',
        'Could not find hyPlayerConfig',
        'Could not find stream property',
        'forbidden',
        'No streamPlaybackAccessToken in response',
        'Missing token or signature',
        'Twitch GQL error:',
      ];
      if (expectedErrors.some(m => e.message.includes(m))) {
        return new Response('live is offline', { status: 404, headers: corsHeaders });
      }
      return new Response('Internal error', { status: 500, headers: corsHeaders });
    }
  },
};

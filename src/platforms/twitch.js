import { UA } from '../utils.js';

const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

export async function getTwitchStreamUrl(channelName) {
  const gqlQuery = {
    operationName: 'PlaybackAccessToken',
    query: `
      query PlaybackAccessToken($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!, $platform: String!) {
        streamPlaybackAccessToken(channelName: $login, params: { platform: $platform, playerBackend: "mediaplayer", playerType: $playerType }) @include(if: $isLive) {
          value
          signature
          authorization { isForbidden forbiddenReasonCode }
        }
        videoPlaybackAccessToken(id: $vodID, params: { platform: $platform, playerBackend: "mediaplayer", playerType: $playerType }) @include(if: $isVod) {
          value
          signature
        }
      }
    `,
    variables: {
      login: channelName,
      isLive: true,
      vodID: '',
      isVod: false,
      playerType: 'site',
      platform: 'web',
    },
  };

  const res = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      'Content-Type': 'application/json',
      'User-Agent': UA,
      'Referer': 'https://www.twitch.tv/',
    },
    body: JSON.stringify(gqlQuery),
  });

  if (!res.ok) throw new Error('Twitch GQL HTTP ' + res.status);
  const json = await res.json();

  if (json.errors && json.errors.length) {
    throw new Error('Twitch GQL error: ' + json.errors[0].message);
  }

  const tokenData = json.data?.streamPlaybackAccessToken;
  if (!tokenData) throw new Error('No streamPlaybackAccessToken in response');
  if (tokenData.authorization?.isForbidden) {
    throw new Error('Twitch access forbidden: ' + tokenData.authorization.forbiddenReasonCode);
  }

  const { value, signature } = tokenData;
  if (!value || !signature) throw new Error('Missing token or signature');

  const usherUrl = new URL('https://usher.ttvnw.net/api/channel/hls/' + encodeURIComponent(channelName) + '.m3u8');
  usherUrl.searchParams.set('token', value);
  usherUrl.searchParams.set('sig', signature);
  usherUrl.searchParams.set('allow_source', 'true');
  usherUrl.searchParams.set('fast_bread', 'true');
  usherUrl.searchParams.set('playlist_include_framerate', 'true');
  usherUrl.searchParams.set('player_backend', 'mediaplayer');
  usherUrl.searchParams.set('p', String(Math.floor(9999999 * Math.random())));
  usherUrl.searchParams.set('include_unavailable', 'true');
  usherUrl.searchParams.set('transcode_mode', 'cbr_v1');

  return usherUrl.toString();
}

import { normalizeTwitchUsername, twitchChannelUrlFor } from './twitch-usernames.js';

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/token';
const TWITCH_API_URL = 'https://api.twitch.tv/helix';

function thumbnailUrlFor(stream) {
  return stream?.thumbnail_url
    ? stream.thumbnail_url
        .replace('{width}', '1280')
        .replace('{height}', '720')
    : null;
}

function createAbortSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

export class TwitchLiveChecker {
  constructor({ clientId, clientSecret, timeoutMs = 12000 } = {}) {
    this.clientId = clientId?.trim() ?? '';
    this.clientSecret = clientSecret?.trim() ?? '';
    this.timeoutMs = timeoutMs;
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
  }

  get configured() {
    return Boolean(this.clientId && this.clientSecret);
  }

  async fetchStatus(input) {
    if (!this.configured) {
      throw new Error(
        'Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET in Railway variables.'
      );
    }

    const username = normalizeTwitchUsername(input);
    const [stream, user] = await Promise.all([
      this.fetchStream(username),
      this.fetchUser(username)
    ]);

    if (!stream) {
      return {
        username,
        isLive: false,
        roomId: null,
        channelUrl: twitchChannelUrlFor(username),
        hostName: user?.display_name ?? username,
        avatarUrl: user?.profile_image_url ?? null
      };
    }

    return {
      username: stream.user_login ?? username,
      isLive: true,
      roomId: stream.id ?? null,
      channelUrl: twitchChannelUrlFor(stream.user_login ?? username),
      hostName: stream.user_name ?? user?.display_name ?? username,
      title: stream.title || `${stream.user_name ?? username} is live on Twitch`,
      description: stream.game_name
        ? `Streaming ${stream.game_name}`
        : 'Tap through to watch the stream.',
      gameName: stream.game_name || null,
      startedAt: stream.started_at ?? null,
      previewImageUrl: thumbnailUrlFor(stream),
      avatarUrl: user?.profile_image_url ?? null
    };
  }

  async fetchStream(username) {
    const body = await this.fetchHelix('/streams', {
      user_login: username
    });

    return body.data?.[0] ?? null;
  }

  async fetchUser(username) {
    const body = await this.fetchHelix('/users', {
      login: username
    });

    return body.data?.[0] ?? null;
  }

  async fetchHelix(path, params, retry = true) {
    const token = await this.getAccessToken();
    const url = new URL(`${TWITCH_API_URL}${path}`);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    }

    const timeout = createAbortSignal(this.timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Client-Id': this.clientId
        },
        signal: timeout.signal
      });

      if (response.status === 401 && retry) {
        this.accessToken = null;
        this.accessTokenExpiresAt = 0;
        return this.fetchHelix(path, params, false);
      }

      if (!response.ok) {
        throw new Error(
          `Twitch API request failed with HTTP ${response.status}.`
        );
      }

      return response.json();
    } finally {
      timeout.clear();
    }
  }

  async getAccessToken() {
    const now = Date.now();

    if (this.accessToken && now < this.accessTokenExpiresAt) {
      return this.accessToken;
    }

    const timeout = createAbortSignal(this.timeoutMs);
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'client_credentials'
    });

    try {
      const response = await fetch(TWITCH_AUTH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body,
        signal: timeout.signal
      });

      if (!response.ok) {
        throw new Error(
          `Twitch token request failed with HTTP ${response.status}.`
        );
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.accessTokenExpiresAt =
        now + Math.max(Number(data.expires_in ?? 3600) - 60, 60) * 1000;

      return this.accessToken;
    } finally {
      timeout.clear();
    }
  }
}

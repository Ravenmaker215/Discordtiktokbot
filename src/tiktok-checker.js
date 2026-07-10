import { TikTokLiveConnection } from 'tiktok-live-connector';
import { normalizeTikTokUsername } from './usernames.js';

function isOfflineError(error) {
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase();
  return text.includes('offline') || text.includes('not live');
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function firstText(...values) {
  const value = firstValue(...values);
  return value === undefined ? null : String(value);
}

function firstNumber(...values) {
  const value = firstValue(...values);
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function maybeImageUrl(value) {
  if (typeof value === 'string') {
    return value.startsWith('http') ? value : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = maybeImageUrl(item);
      if (found) {
        return found;
      }
    }
  }

  if (value && typeof value === 'object') {
    const preferredKeys = [
      'avatarLarger',
      'avatarMedium',
      'avatarThumb',
      'avatar_large',
      'avatar_medium',
      'avatar_thumb',
      'cover',
      'image',
      'urlList',
      'url_list',
      'urls',
      'url'
    ];

    for (const key of preferredKeys) {
      const found = maybeImageUrl(value[key]);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function extractRoomDetails(roomInfo) {
  if (!roomInfo || typeof roomInfo !== 'object') {
    return {};
  }

  const owner = roomInfo.owner ?? roomInfo.user ?? roomInfo.host ?? {};
  const stats = roomInfo.stats ?? roomInfo.statistics ?? roomInfo.roomStats ?? {};
  const liveIntro = roomInfo.liveIntro ?? roomInfo.live_intro ?? {};
  const cover =
    roomInfo.cover ??
    roomInfo.coverUrl ??
    roomInfo.cover_url ??
    roomInfo.streamCover ??
    roomInfo.stream_cover ??
    roomInfo.image;

  return {
    roomId: firstText(roomInfo.roomId, roomInfo.room_id, roomInfo.id_str, roomInfo.id),
    title: firstText(roomInfo.title, liveIntro.title),
    description: firstText(
      roomInfo.description,
      roomInfo.desc,
      roomInfo.introduction,
      liveIntro.description
    ),
    viewerCount: firstNumber(
      roomInfo.viewerCount,
      roomInfo.viewer_count,
      roomInfo.userCount,
      roomInfo.user_count,
      roomInfo.roomUserCount,
      roomInfo.room_user_count,
      stats.viewerCount,
      stats.viewer_count,
      stats.userCount,
      stats.user_count,
      stats.totalUser,
      stats.total_user,
      stats.total_user_count
    ),
    hostName: firstText(
      owner.nickname,
      owner.nickName,
      owner.displayName,
      owner.display_name,
      owner.uniqueId,
      owner.unique_id,
      owner.displayId,
      owner.display_id
    ),
    avatarUrl: maybeImageUrl(owner),
    previewImageUrl: maybeImageUrl(cover)
  };
}

export class TikTokLiveChecker {
  constructor({ signApiKey = null, timeoutMs = 12000 } = {}) {
    this.signApiKey = signApiKey;
    this.timeoutMs = timeoutMs;
  }

  createConnection(username) {
    const options = {
      processInitialData: false,
      fetchRoomInfoOnConnect: false,
      webClientOptions: {
        timeout: {
          request: this.timeoutMs
        }
      }
    };

    if (this.signApiKey) {
      options.signApiKey = this.signApiKey;
    }

    return new TikTokLiveConnection(username, options);
  }

  async fetchStatus(input) {
    const username = normalizeTikTokUsername(input);
    const connection = this.createConnection(username);

    if (typeof connection.fetchIsLive === 'function') {
      const isLive = await connection.fetchIsLive(username);
      const roomId = isLive ? await this.fetchRoomId(connection) : null;
      const details = isLive
        ? await this.fetchLiveDetails(connection, roomId)
        : {};

      return {
        username,
        isLive,
        roomId: details.roomId ?? roomId,
        ...details
      };
    }

    return this.fetchStatusByConnecting(connection, username);
  }

  async fetchRoomId(connection) {
    if (typeof connection.fetchRoomId !== 'function') {
      return null;
    }

    try {
      return String(await connection.fetchRoomId());
    } catch {
      return null;
    }
  }

  async fetchLiveDetails(connection, roomId) {
    if (typeof connection.fetchRoomInfo !== 'function') {
      return {};
    }

    try {
      const roomInfo = await connection.fetchRoomInfo(roomId ?? undefined);
      return extractRoomDetails(roomInfo);
    } catch {
      return {};
    }
  }

  async fetchStatusByConnecting(connection, username) {
    try {
      const state = await connection.connect();
      const details = extractRoomDetails(state?.roomInfo ?? connection.roomInfo);
      await connection.disconnect();

      return {
        username,
        isLive: true,
        roomId: details.roomId ?? (state?.roomId ? String(state.roomId) : null),
        ...details
      };
    } catch (error) {
      if (isOfflineError(error)) {
        return {
          username,
          isLive: false,
          roomId: null
        };
      }

      throw error;
    }
  }
}

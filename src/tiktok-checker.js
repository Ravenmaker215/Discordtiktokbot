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

function decodeHtmlEntities(value) {
  if (!value) {
    return null;
  }

  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function firstUsefulText(...values) {
  for (const value of values) {
    const text = decodeHtmlEntities(value);

    if (text && !/^tiktok\s*-\s*make your day$/i.test(text)) {
      return text;
    }
  }

  return null;
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

  const room = roomInfo.data ?? roomInfo.room ?? roomInfo;
  const owner =
    room.owner ??
    room.user ??
    room.host ??
    roomInfo.owner ??
    roomInfo.user ??
    roomInfo.host ??
    {};
  const stats =
    room.stats ??
    room.statistics ??
    room.roomStats ??
    roomInfo.stats ??
    roomInfo.statistics ??
    roomInfo.roomStats ??
    {};
  const liveIntro =
    room.liveIntro ??
    room.live_intro ??
    roomInfo.liveIntro ??
    roomInfo.live_intro ??
    {};
  const cover =
    room.cover ??
    room.coverUrl ??
    room.cover_url ??
    room.dynamicCover ??
    room.dynamic_cover ??
    room.streamCover ??
    room.stream_cover ??
    room.image ??
    roomInfo.cover ??
    roomInfo.coverUrl ??
    roomInfo.cover_url ??
    roomInfo.dynamicCover ??
    roomInfo.dynamic_cover ??
    roomInfo.streamCover ??
    roomInfo.stream_cover ??
    roomInfo.image;

  return {
    roomId: firstText(
      room.roomId,
      room.room_id,
      room.id_str,
      room.id,
      roomInfo.roomId,
      roomInfo.room_id,
      roomInfo.id_str,
      roomInfo.id
    ),
    title: firstUsefulText(room.title, liveIntro.title, roomInfo.title),
    description: firstUsefulText(
      room.description,
      room.desc,
      room.introduction,
      room.shareText,
      room.share_text,
      roomInfo.description,
      roomInfo.desc,
      roomInfo.introduction,
      liveIntro.description
    ),
    viewerCount: firstNumber(
      room.viewerCount,
      room.viewer_count,
      room.userCount,
      room.user_count,
      room.roomUserCount,
      room.room_user_count,
      stats.viewerCount,
      stats.viewer_count,
      stats.userCount,
      stats.user_count,
      stats.totalUser,
      stats.total_user,
      stats.total_user_count
    ),
    hostName: firstUsefulText(
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

function extractMetaContent(html, property) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of metaTags) {
    if (
      !tag.includes(`property="${property}"`) &&
      !tag.includes(`property='${property}'`) &&
      !tag.includes(`name="${property}"`) &&
      !tag.includes(`name='${property}'`)
    ) {
      continue;
    }

    const contentMatch =
      tag.match(/content="([^"]+)"/i) ?? tag.match(/content='([^']+)'/i);

    if (contentMatch?.[1]) {
      return decodeHtmlEntities(contentMatch[1]);
    }
  }

  return null;
}

async function fetchPageMetadata(username, timeoutMs) {
  if (typeof fetch !== 'function') {
    return {};
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://www.tiktok.com/@${username}/live`, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return {};
    }

    const html = await response.text();
    const title = firstUsefulText(
      extractMetaContent(html, 'og:title'),
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
    );

    return {
      title,
      description: firstUsefulText(
        extractMetaContent(html, 'og:description'),
        extractMetaContent(html, 'description')
      ),
      previewImageUrl: maybeImageUrl(extractMetaContent(html, 'og:image')),
      avatarUrl: maybeImageUrl(extractMetaContent(html, 'twitter:image'))
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
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
        ? await this.fetchLiveDetails(connection, username, roomId)
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

  async fetchLiveDetails(connection, username, roomId) {
    const pageDetailsPromise = fetchPageMetadata(username, this.timeoutMs);

    if (typeof connection.fetchRoomInfo !== 'function') {
      return pageDetailsPromise;
    }

    try {
      const roomInfo = await connection.fetchRoomInfo(roomId ?? undefined);
      const roomDetails = extractRoomDetails(roomInfo);
      const pageDetails = await pageDetailsPromise;

      return {
        ...pageDetails,
        ...roomDetails,
        previewImageUrl:
          roomDetails.previewImageUrl ?? pageDetails.previewImageUrl ?? null,
        avatarUrl: roomDetails.avatarUrl ?? pageDetails.avatarUrl ?? null,
        title: roomDetails.title ?? pageDetails.title ?? null,
        description: roomDetails.description ?? pageDetails.description ?? null
      };
    } catch {
      return pageDetailsPromise;
    }
  }

  async fetchStatusByConnecting(connection, username) {
    try {
      const state = await connection.connect();
      const details = extractRoomDetails(state?.roomInfo ?? connection.roomInfo);
      const pageDetails = await fetchPageMetadata(username, this.timeoutMs);
      await connection.disconnect();

      return {
        username,
        isLive: true,
        roomId: details.roomId ?? (state?.roomId ? String(state.roomId) : null),
        ...pageDetails,
        ...details,
        previewImageUrl:
          details.previewImageUrl ?? pageDetails.previewImageUrl ?? null,
        avatarUrl: details.avatarUrl ?? pageDetails.avatarUrl ?? null,
        title: details.title ?? pageDetails.title ?? null,
        description: details.description ?? pageDetails.description ?? null
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

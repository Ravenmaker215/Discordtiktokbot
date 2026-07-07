import { TikTokLiveConnection } from 'tiktok-live-connector';
import { normalizeTikTokUsername } from './usernames.js';

function isOfflineError(error) {
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase();
  return text.includes('offline') || text.includes('not live');
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

      return {
        username,
        isLive,
        roomId
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

  async fetchStatusByConnecting(connection, username) {
    try {
      const state = await connection.connect();
      await connection.disconnect();

      return {
        username,
        isLive: true,
        roomId: state?.roomId ? String(state.roomId) : null
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

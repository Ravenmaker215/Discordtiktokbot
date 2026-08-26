import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeTikTokUsername } from './usernames.js';

const EMPTY_DATA = {
  version: 1,
  users: []
};

function normalizeGame(game) {
  const normalized = String(game ?? '').trim();

  return normalized ? normalized.slice(0, 80) : null;
}

function createUser({
  username,
  channelId,
  roleId,
  game,
  addedBy,
  normalizeUsername = normalizeTikTokUsername
}) {
  const now = new Date().toISOString();

  return {
    username: normalizeUsername(username),
    channelId,
    roleId: roleId ?? null,
    game: normalizeGame(game),
    addedBy: addedBy ?? null,
    addedAt: now,
    updatedAt: now,
    lastKnownLive: false,
    lastCheckedAt: null,
    lastLiveAt: null,
    lastOfflineAt: null,
    lastNotifiedAt: null,
    lastRoomId: null,
    lastError: null
  };
}

function sanitizeData(data, normalizeUsername = normalizeTikTokUsername) {
  const users = Array.isArray(data?.users) ? data.users : [];
  const deduped = new Map();

  for (const user of users) {
    try {
      const username = normalizeUsername(user.username);
      deduped.set(username, {
        ...createUser({
          username,
          channelId: user.channelId ?? null,
          roleId: user.roleId ?? null,
          game: user.game ?? null,
          addedBy: user.addedBy ?? null,
          normalizeUsername
        }),
        ...user,
        username
      });
    } catch {
      // Skip malformed rows instead of preventing the bot from starting.
    }
  }

  return {
    version: 1,
    users: [...deduped.values()].sort((a, b) =>
      a.username.localeCompare(b.username)
    )
  };
}

export class WatchStore {
  constructor(filePath, normalizeUsername = normalizeTikTokUsername) {
    this.filePath = filePath;
    this.normalizeUsername = normalizeUsername;
    this.queue = Promise.resolve();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return sanitizeData(JSON.parse(raw), this.normalizeUsername);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.save(EMPTY_DATA);
        return structuredClone(EMPTY_DATA);
      }

      throw error;
    }
  }

  async save(data) {
    const sanitized = sanitizeData(data, this.normalizeUsername);
    const directory = path.dirname(this.filePath);
    const tempFile = `${this.filePath}.tmp`;

    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(tempFile, `${JSON.stringify(sanitized, null, 2)}\n`);
    await fs.rename(tempFile, this.filePath);
  }

  async update(mutator) {
    const next = this.queue.then(async () => {
      const data = await this.load();
      const result = await mutator(data);
      await this.save(data);
      return result;
    });

    this.queue = next.catch(() => {});
    return next;
  }

  async list() {
    const data = await this.load();
    return data.users;
  }

  async get(username) {
    const normalized = this.normalizeUsername(username);
    const data = await this.load();

    return data.users.find((user) => user.username === normalized) ?? null;
  }

  async add({ username, channelId, roleId, game, addedBy }) {
    const normalized = this.normalizeUsername(username);
    const normalizedGame = normalizeGame(game);

    return this.update((data) => {
      const existing = data.users.find((user) => user.username === normalized);
      const now = new Date().toISOString();

      if (existing) {
        existing.channelId = channelId ?? existing.channelId;
        existing.roleId = roleId ?? existing.roleId ?? null;
        existing.game = normalizedGame ?? existing.game ?? null;
        existing.updatedAt = now;
        return { created: false, user: existing };
      }

      const user = createUser({
        username: normalized,
        channelId,
        roleId,
        game: normalizedGame,
        addedBy,
        normalizeUsername: this.normalizeUsername
      });

      data.users.push(user);
      data.users.sort((a, b) => a.username.localeCompare(b.username));

      return { created: true, user };
    });
  }

  async remove(username) {
    const normalized = this.normalizeUsername(username);

    return this.update((data) => {
      const originalLength = data.users.length;
      data.users = data.users.filter((user) => user.username !== normalized);

      return originalLength !== data.users.length;
    });
  }

  async setGame(username, game) {
    const normalized = this.normalizeUsername(username);
    const normalizedGame = normalizeGame(game);

    return this.update((data) => {
      const user = data.users.find((entry) => entry.username === normalized);

      if (!user) {
        return null;
      }

      user.game = normalizedGame;
      user.updatedAt = new Date().toISOString();
      return user;
    });
  }

  async updateStatus(username, status) {
    const normalized = this.normalizeUsername(username);

    return this.update((data) => {
      const user = data.users.find((entry) => entry.username === normalized);

      if (!user) {
        return null;
      }

      Object.assign(user, {
        ...status,
        updatedAt: new Date().toISOString()
      });

      return user;
    });
  }
}

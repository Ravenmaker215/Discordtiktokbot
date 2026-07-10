import path from 'node:path';
import { loadEnvFile } from './env.js';

loadEnvFile();

const MIN_POLL_SECONDS = 30;
const VALID_ACTIVITY_TYPES = new Set([
  'PLAYING',
  'STREAMING',
  'LISTENING',
  'WATCHING',
  'COMPETING'
]);
const VALID_BOT_STATUSES = new Set(['online', 'idle', 'dnd', 'invisible']);

function readPollMs() {
  const rawValue = Number.parseInt(process.env.TIKTOK_POLL_SECONDS ?? '60', 10);
  const seconds = Number.isFinite(rawValue) ? rawValue : 60;

  return Math.max(seconds, MIN_POLL_SECONDS) * 1000;
}

function readDataFile() {
  const configured = process.env.DATA_FILE?.trim();

  if (!configured) {
    return path.join(process.cwd(), 'data', 'watched-users.json');
  }

  return path.isAbsolute(configured)
    ? configured
    : path.join(process.cwd(), configured);
}

function readActivityType() {
  const configured = process.env.BOT_ACTIVITY_TYPE?.trim().toUpperCase();

  return VALID_ACTIVITY_TYPES.has(configured) ? configured : 'PLAYING';
}

function readBotStatus() {
  const configured = process.env.BOT_STATUS?.trim().toLowerCase();

  return VALID_BOT_STATUSES.has(configured) ? configured : 'online';
}

export const config = {
  discordToken: process.env.DISCORD_TOKEN?.trim() ?? '',
  discordClientId: process.env.DISCORD_CLIENT_ID?.trim() ?? '',
  discordGuildId: process.env.DISCORD_GUILD_ID?.trim() || null,
  defaultAlertChannelId: process.env.DISCORD_ALERT_CHANNEL_ID?.trim() || null,
  botActivityName: process.env.BOT_ACTIVITY_NAME?.trim() || null,
  botActivityType: readActivityType(),
  botStatus: readBotStatus(),
  pollMs: readPollMs(),
  dataFile: readDataFile(),
  tiktokSignApiKey:
    process.env.TIKTOK_SIGN_API_KEY?.trim() ||
    process.env.EULER_SIGN_API_KEY?.trim() ||
    null
};

export function requireBotConfig() {
  if (!config.discordToken) {
    throw new Error('Missing DISCORD_TOKEN in .env');
  }
}

export function requireCommandDeployConfig() {
  requireBotConfig();

  if (!config.discordClientId) {
    throw new Error('Missing DISCORD_CLIENT_ID in .env');
  }
}

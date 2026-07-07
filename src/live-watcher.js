import { EmbedBuilder } from 'discord.js';
import { liveUrlFor } from './usernames.js';

const TIKTOK_COLOR = 0xfe2c55;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchStatusWithRetry(checker, username) {
  const attempts = 2;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await checker.fetchStatus(username);
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await sleep(1500);
      }
    }
  }

  throw lastError;
}

export class LiveWatcher {
  constructor({
    client,
    store,
    checker,
    pollMs,
    defaultAlertChannelId = null,
    logger = console
  }) {
    this.client = client;
    this.store = store;
    this.checker = checker;
    this.pollMs = pollMs;
    this.defaultAlertChannelId = defaultAlertChannelId;
    this.logger = logger;
    this.timer = null;
    this.stopped = true;
  }

  start() {
    if (!this.stopped) {
      return;
    }

    this.stopped = false;
    this.schedule(1000);
  }

  stop() {
    this.stopped = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  schedule(delayMs = this.pollMs) {
    if (this.stopped) {
      return;
    }

    this.timer = setTimeout(async () => {
      await this.tick();
      this.schedule();
    }, delayMs);
  }

  async tick() {
    const users = await this.store.list();

    if (users.length === 0) {
      this.logger.log('No TikTok accounts are being watched yet.');
      return;
    }

    this.logger.log(`Checking ${users.length} TikTok account(s)...`);

    for (const watchedUser of users) {
      await this.checkUser(watchedUser.username);
    }
  }

  async checkUser(username) {
    try {
      const status = await fetchStatusWithRetry(this.checker, username);
      const latestUser = await this.store.get(username);

      if (!latestUser) {
        return;
      }

      const checkedAt = new Date().toISOString();
      const wentLive = status.isLive && !latestUser.lastKnownLive;
      const wentOffline = !status.isLive && latestUser.lastKnownLive;

      await this.store.updateStatus(username, {
        lastKnownLive: status.isLive,
        lastCheckedAt: checkedAt,
        lastLiveAt: status.isLive ? checkedAt : latestUser.lastLiveAt,
        lastOfflineAt: wentOffline ? checkedAt : latestUser.lastOfflineAt,
        lastRoomId: status.roomId,
        lastError: null
      });

      if (wentLive) {
        await this.sendLiveAlert(latestUser, status);
        await this.store.updateStatus(username, {
          lastNotifiedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      const message = error?.message ?? String(error);
      this.logger.warn(`Could not check @${username}: ${message}`);

      await this.store.updateStatus(username, {
        lastCheckedAt: new Date().toISOString(),
        lastError: message
      });
    }
  }

  async sendLiveAlert(user, status) {
    const channelId = user.channelId || this.defaultAlertChannelId;

    if (!channelId) {
      this.logger.warn(
        `@${user.username} is live, but no Discord channel is configured.`
      );
      return;
    }

    const channel = await this.client.channels.fetch(channelId);

    if (!channel?.isTextBased()) {
      this.logger.warn(`Configured channel ${channelId} is not text-based.`);
      return;
    }

    const url = liveUrlFor(user.username);
    const rolePing = user.roleId ? `<@&${user.roleId}> ` : '';
    const embed = new EmbedBuilder()
      .setColor(TIKTOK_COLOR)
      .setTitle(`@${user.username} is LIVE on TikTok`)
      .setURL(url)
      .setDescription('Tap through to watch the live stream.')
      .addFields(
        {
          name: 'TikTok',
          value: `[Open live](${url})`,
          inline: true
        },
        {
          name: 'Room',
          value: status.roomId ?? 'Unknown',
          inline: true
        }
      )
      .setTimestamp(new Date());

    await channel.send({
      content: `${rolePing}@${user.username} is LIVE on TikTok: ${url}`,
      embeds: [embed],
      allowedMentions: user.roleId
        ? {
            roles: [user.roleId]
          }
        : {
            parse: []
          }
    });

    this.logger.log(`Sent LIVE alert for @${user.username}.`);
  }
}

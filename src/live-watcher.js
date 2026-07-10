import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import { liveUrlFor } from './usernames.js';

const TIKTOK_COLOR = 0xfe2c55;

function truncateText(value, maxLength) {
  if (!value) {
    return null;
  }

  const text = String(value);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

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
    const displayName = status.hostName ?? `@${user.username}`;
    const title = truncateText(
      status.title ?? `${displayName} is LIVE on TikTok`,
      256
    );
    const description = truncateText(
      status.description ?? 'Tap through to watch the live stream.',
      4096
    );
    const author = {
      name: truncateText(displayName, 256)
    };

    if (status.avatarUrl) {
      author.iconURL = status.avatarUrl;
    }

    const embed = new EmbedBuilder()
      .setColor(TIKTOK_COLOR)
      .setAuthor(author)
      .setTitle(title)
      .setURL(url)
      .setDescription(description)
      .setTimestamp(new Date());

    if (user.game) {
      embed.addFields({
        name: 'Game',
        value: truncateText(user.game, 1024),
        inline: true
      });
    }

    embed.addFields({
      name: 'Room',
      value: status.roomId ?? 'Unknown',
      inline: true
    });

    if (status.previewImageUrl) {
      embed.setImage(status.previewImageUrl);
    }

    if (status.avatarUrl && !status.previewImageUrl) {
      embed.setThumbnail(status.avatarUrl);
    }

    const components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Watch Stream')
          .setStyle(ButtonStyle.Link)
          .setURL(url)
      )
    ];

    await channel.send({
      content: `${rolePing}@${user.username} is LIVE on TikTok`,
      embeds: [embed],
      components,
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

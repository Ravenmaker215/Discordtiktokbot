import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import { twitchChannelUrlFor } from './twitch-usernames.js';

const TWITCH_COLOR = 0x9146ff;

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

export class TwitchWatcher {
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
      this.logger.log('No Twitch accounts are being watched yet.');
      return;
    }

    this.logger.log(`Checking ${users.length} Twitch account(s)...`);

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
      this.logger.warn(`Could not check Twitch @${username}: ${message}`);

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
        `${user.username} is live on Twitch, but no Discord channel is configured.`
      );
      return;
    }

    const channel = await this.client.channels.fetch(channelId);

    if (!channel?.isTextBased()) {
      this.logger.warn(`Configured channel ${channelId} is not text-based.`);
      return;
    }

    const url = status.channelUrl ?? twitchChannelUrlFor(user.username);
    const rolePing = user.roleId ? `<@&${user.roleId}> ` : '';
    const displayName = status.hostName ?? user.username;
    const author = {
      name: truncateText(displayName, 256)
    };

    if (status.avatarUrl) {
      author.iconURL = status.avatarUrl;
    }

    const embed = new EmbedBuilder()
      .setColor(TWITCH_COLOR)
      .setAuthor(author)
      .setTitle(truncateText(status.title ?? `${displayName} is live on Twitch`, 256))
      .setURL(url)
      .setDescription(
        truncateText(status.description ?? 'Tap through to watch the stream.', 4096)
      )
      .setTimestamp(new Date());

    if (status.gameName) {
      embed.addFields({
        name: 'Game',
        value: truncateText(status.gameName, 1024),
        inline: true
      });
    }

    if (status.startedAt) {
      embed.addFields({
        name: 'Started',
        value: `<t:${Math.floor(new Date(status.startedAt).getTime() / 1000)}:R>`,
        inline: true
      });
    }

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
      content: `${rolePing}${displayName} is LIVE on Twitch`,
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

    this.logger.log(`Sent Twitch LIVE alert for ${user.username}.`);
  }
}

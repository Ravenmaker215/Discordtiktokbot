import { ActivityType, Client, Events, GatewayIntentBits } from 'discord.js';
import { config, requireBotConfig } from './config.js';
import { handleInteraction } from './interactions.js';
import { handleTwitchInteraction } from './twitch-interactions.js';
import { LiveWatcher } from './live-watcher.js';
import { WatchStore } from './storage.js';
import { TikTokLiveChecker } from './tiktok-checker.js';
import { TwitchLiveChecker } from './twitch-checker.js';
import { normalizeTwitchUsername } from './twitch-usernames.js';
import { TwitchWatcher } from './twitch-watcher.js';

requireBotConfig();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const tiktokStore = new WatchStore(config.dataFile);
const tiktokChecker = new TikTokLiveChecker({
  signApiKey: config.tiktokSignApiKey
});
const tiktokWatcher = new LiveWatcher({
  client,
  store: tiktokStore,
  checker: tiktokChecker,
  pollMs: config.pollMs,
  defaultAlertChannelId: config.defaultAlertChannelId
});
const twitchStore = new WatchStore(
  config.twitchDataFile,
  normalizeTwitchUsername
);
const twitchChecker = new TwitchLiveChecker({
  clientId: config.twitchClientId,
  clientSecret: config.twitchClientSecret
});
const twitchWatcher = new TwitchWatcher({
  client,
  store: twitchStore,
  checker: twitchChecker,
  pollMs: config.twitchPollMs,
  defaultAlertChannelId: config.defaultAlertChannelId
});

const activityTypes = {
  PLAYING: ActivityType.Playing,
  STREAMING: ActivityType.Streaming,
  LISTENING: ActivityType.Listening,
  WATCHING: ActivityType.Watching,
  COMPETING: ActivityType.Competing
};

function applyBotPresence(readyClient) {
  if (!config.botActivityName) {
    readyClient.user.setStatus(config.botStatus);
    return;
  }

  readyClient.user.setPresence({
    status: config.botStatus,
    activities: [
      {
        name: config.botActivityName,
        type: activityTypes[config.botActivityType] ?? ActivityType.Playing
      }
    ]
  });

  console.log(
    `Discord activity set to ${config.botActivityType.toLowerCase()} ${config.botActivityName}.`
  );
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}.`);
  console.log(`TikTok polling every ${Math.round(config.pollMs / 1000)}s.`);
  applyBotPresence(readyClient);
  tiktokWatcher.start();

  if (config.twitchEnabled) {
    console.log(
      `Twitch polling every ${Math.round(config.twitchPollMs / 1000)}s.`
    );
    twitchWatcher.start();
  } else {
    console.log(
      'Twitch alerts disabled. Add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to enable them.'
    );
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleInteraction({
      interaction,
      store: tiktokStore,
      checker: tiktokChecker
    });
    await handleTwitchInteraction({
      interaction,
      store: twitchStore,
      checker: twitchChecker,
      twitchEnabled: config.twitchEnabled
    });
  } catch (error) {
    const message = error?.message ?? String(error);
    console.error('Interaction failed:', error);

    const response = {
      content: `Something went wrong: ${message}`,
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(response);
    } else {
      await interaction.reply(response);
    }
  }
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function shutdown() {
  console.log('Shutting down...');
  tiktokWatcher.stop();
  twitchWatcher.stop();
  client.destroy();
  process.exit(0);
}

await client.login(config.discordToken);

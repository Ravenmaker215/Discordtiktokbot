import { ActivityType, Client, Events, GatewayIntentBits } from 'discord.js';
import { config, requireBotConfig } from './config.js';
import { handleInteraction } from './interactions.js';
import { LiveWatcher } from './live-watcher.js';
import { WatchStore } from './storage.js';
import { TikTokLiveChecker } from './tiktok-checker.js';

requireBotConfig();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const store = new WatchStore(config.dataFile);
const checker = new TikTokLiveChecker({
  signApiKey: config.tiktokSignApiKey
});
const watcher = new LiveWatcher({
  client,
  store,
  checker,
  pollMs: config.pollMs,
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
  watcher.start();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleInteraction({
      interaction,
      store,
      checker
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
  watcher.stop();
  client.destroy();
  process.exit(0);
}

await client.login(config.discordToken);

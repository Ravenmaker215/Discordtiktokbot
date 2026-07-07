import { REST, Routes } from 'discord.js';
import { commandJson } from './commands.js';
import { config, requireCommandDeployConfig } from './config.js';

requireCommandDeployConfig();

const rest = new REST({ version: '10' }).setToken(config.discordToken);
const route = config.discordGuildId
  ? Routes.applicationGuildCommands(
      config.discordClientId,
      config.discordGuildId
    )
  : Routes.applicationCommands(config.discordClientId);

console.log(
  config.discordGuildId
    ? `Deploying commands to guild ${config.discordGuildId}...`
    : 'Deploying global commands...'
);

await rest.put(route, { body: commandJson });

console.log('Slash commands deployed.');

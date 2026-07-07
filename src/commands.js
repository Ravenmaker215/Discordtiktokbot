import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';

export const tiktokCommand = new SlashCommandBuilder()
  .setName('tiktok')
  .setDescription('Manage TikTok LIVE alerts')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('add')
      .setDescription('Watch a TikTok account for LIVE alerts')
      .addStringOption((option) =>
        option
          .setName('username')
          .setDescription('TikTok username, @handle, or profile URL')
          .setRequired(true)
      )
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('Where alerts should be posted')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
      .addRoleOption((option) =>
        option
          .setName('role')
          .setDescription('Optional role to mention when this user goes live')
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('remove')
      .setDescription('Stop watching a TikTok account')
      .addStringOption((option) =>
        option
          .setName('username')
          .setDescription('TikTok username, @handle, or profile URL')
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('list').setDescription('Show watched TikTok accounts')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('check')
      .setDescription('Check a TikTok account right now')
      .addStringOption((option) =>
        option
          .setName('username')
          .setDescription('TikTok username, @handle, or profile URL')
          .setRequired(true)
      )
  );

export const commands = [tiktokCommand];
export const commandJson = commands.map((command) => command.toJSON());

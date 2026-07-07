import { EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { liveUrlFor, normalizeTikTokUsername } from './usernames.js';

const TIKTOK_COLOR = 0xfe2c55;

function hasManagePermission(interaction) {
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );
}

function formatChannel(channelId) {
  return channelId ? `<#${channelId}>` : 'No channel';
}

function formatRole(roleId) {
  return roleId ? `<@&${roleId}>` : 'No role ping';
}

function summarizeUsers(users) {
  if (users.length === 0) {
    return 'No TikTok accounts are being watched yet.';
  }

  const lines = users.map((user) => {
    const status = user.lastKnownLive ? 'LIVE' : 'offline';
    const checked = user.lastCheckedAt
      ? `<t:${Math.floor(new Date(user.lastCheckedAt).getTime() / 1000)}:R>`
      : 'not checked yet';

    return `@${user.username} - ${status} - ${formatChannel(
      user.channelId
    )} - checked ${checked}`;
  });

  const body = lines.join('\n');

  if (body.length <= 3900) {
    return body;
  }

  return `${body.slice(0, 3800)}\n...and ${users.length} total watched accounts.`;
}

export async function handleInteraction({ interaction, store, checker }) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'tiktok') {
    return;
  }

  if (!interaction.inGuild()) {
    await interaction.reply({
      content: 'Please use this command inside a server.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (!hasManagePermission(interaction)) {
    await interaction.reply({
      content: 'You need Manage Server permission to manage TikTok alerts.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'add') {
    await handleAdd(interaction, store);
    return;
  }

  if (subcommand === 'remove') {
    await handleRemove(interaction, store);
    return;
  }

  if (subcommand === 'list') {
    await handleList(interaction, store);
    return;
  }

  if (subcommand === 'check') {
    await handleCheck(interaction, checker);
  }
}

async function handleAdd(interaction, store) {
  const username = normalizeTikTokUsername(
    interaction.options.getString('username', true)
  );
  const channel = interaction.options.getChannel('channel') ?? interaction.channel;
  const role = interaction.options.getRole('role');

  const result = await store.add({
    username,
    channelId: channel.id,
    roleId: role?.id ?? null,
    addedBy: interaction.user.id
  });

  const embed = new EmbedBuilder()
    .setColor(TIKTOK_COLOR)
    .setTitle(
      result.created
        ? `Now watching @${result.user.username}`
        : `Updated @${result.user.username}`
    )
    .setURL(liveUrlFor(result.user.username))
    .addFields(
      {
        name: 'Alert channel',
        value: formatChannel(result.user.channelId),
        inline: true
      },
      {
        name: 'Role ping',
        value: formatRole(result.user.roleId),
        inline: true
      }
    );

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral
  });
}

async function handleRemove(interaction, store) {
  const username = normalizeTikTokUsername(
    interaction.options.getString('username', true)
  );
  const removed = await store.remove(username);

  await interaction.reply({
    content: removed
      ? `Removed @${username} from the TikTok watch list.`
      : `@${username} was not on the TikTok watch list.`,
    flags: MessageFlags.Ephemeral
  });
}

async function handleList(interaction, store) {
  const users = await store.list();
  const embed = new EmbedBuilder()
    .setColor(TIKTOK_COLOR)
    .setTitle('Watched TikTok Accounts')
    .setDescription(summarizeUsers(users));

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral
  });
}

async function handleCheck(interaction, checker) {
  const username = normalizeTikTokUsername(
    interaction.options.getString('username', true)
  );

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral
  });

  const status = await checker.fetchStatus(username);
  const url = liveUrlFor(username);
  const embed = new EmbedBuilder()
    .setColor(status.isLive ? TIKTOK_COLOR : 0x5865f2)
    .setTitle(
      status.isLive
        ? `@${username} is LIVE on TikTok`
        : `@${username} is not live right now`
    )
    .setURL(url)
    .addFields({
      name: 'Link',
      value: `[Open TikTok](${url})`
    });

  if (status.roomId) {
    embed.addFields({
      name: 'Room',
      value: status.roomId
    });
  }

  await interaction.editReply({
    embeds: [embed]
  });
}

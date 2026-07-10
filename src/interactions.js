import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits
} from 'discord.js';
import { liveUrlFor, normalizeTikTokUsername } from './usernames.js';

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

function formatGame(game) {
  return game ? game : 'No game set';
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

    const game = user.game ? ` - ${user.game}` : '';

    return `@${user.username}${game} - ${status} - ${formatChannel(
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

  if (subcommand === 'game') {
    await handleGame(interaction, store);
    return;
  }

  if (subcommand === 'cleargame') {
    await handleClearGame(interaction, store);
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
  const game = interaction.options.getString('game');

  const result = await store.add({
    username,
    channelId: channel.id,
    roleId: role?.id ?? null,
    game,
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
      },
      {
        name: 'Game',
        value: formatGame(result.user.game),
        inline: true
      }
    );

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral
  });
}

async function handleGame(interaction, store) {
  const username = normalizeTikTokUsername(
    interaction.options.getString('username', true)
  );
  const game = interaction.options.getString('game', true).trim();
  const user = await store.setGame(username, game);

  await interaction.reply({
    content: user
      ? `Set @${username}'s game/category to ${user.game}.`
      : `@${username} is not on the TikTok watch list yet. Add them first with /tiktok add.`,
    flags: MessageFlags.Ephemeral
  });
}

async function handleClearGame(interaction, store) {
  const username = normalizeTikTokUsername(
    interaction.options.getString('username', true)
  );
  const user = await store.setGame(username, null);

  await interaction.reply({
    content: user
      ? `Cleared @${username}'s saved game/category.`
      : `@${username} is not on the TikTok watch list.`,
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
  const displayName = status.hostName ?? `@${username}`;
  const embed = new EmbedBuilder()
    .setColor(status.isLive ? TIKTOK_COLOR : 0x5865f2)
    .setTitle(
      status.isLive
        ? truncateText(status.title ?? `${displayName} is LIVE on TikTok`, 256)
        : `@${username} is not live right now`
    )
    .setURL(url)
    .addFields({
      name: 'Link',
      value: `[Open TikTok](${url})`
    });

  if (status.isLive) {
    const author = {
      name: truncateText(displayName, 256)
    };

    if (status.avatarUrl) {
      author.iconURL = status.avatarUrl;
    }

    embed
      .setAuthor(author)
      .setDescription(
        truncateText(
          status.description ?? 'Tap through to watch the live stream.',
          4096
        )
      );
  }

  if (status.roomId) {
    embed.addFields({
      name: 'Room',
      value: status.roomId
    });
  }

  if (status.previewImageUrl) {
    embed.setImage(status.previewImageUrl);
  } else if (status.avatarUrl) {
    embed.setThumbnail(status.avatarUrl);
  }

  const components = status.isLive
    ? [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Watch Stream')
            .setStyle(ButtonStyle.Link)
            .setURL(url)
        )
      ]
    : [];

  await interaction.editReply({
    embeds: [embed],
    components
  });
}

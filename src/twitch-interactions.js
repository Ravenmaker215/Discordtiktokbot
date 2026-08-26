import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits
} from 'discord.js';
import { normalizeTwitchUsername, twitchChannelUrlFor } from './twitch-usernames.js';

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
    return 'No Twitch accounts are being watched yet.';
  }

  const lines = users.map((user) => {
    const status = user.lastKnownLive ? 'LIVE' : 'offline';
    const checked = user.lastCheckedAt
      ? `<t:${Math.floor(new Date(user.lastCheckedAt).getTime() / 1000)}:R>`
      : 'not checked yet';

    return `${user.username} - ${status} - ${formatChannel(
      user.channelId
    )} - checked ${checked}`;
  });

  const body = lines.join('\n');

  if (body.length <= 3900) {
    return body;
  }

  return `${body.slice(0, 3800)}\n...and ${users.length} total watched accounts.`;
}

function missingConfigMessage() {
  return [
    'Twitch is not configured yet.',
    'Add `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in Railway variables, then redeploy.'
  ].join(' ');
}

export async function handleTwitchInteraction({
  interaction,
  store,
  checker,
  twitchEnabled
}) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'twitch') {
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
      content: 'You need Manage Server permission to manage Twitch alerts.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (!twitchEnabled) {
    await interaction.reply({
      content: missingConfigMessage(),
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
  const username = normalizeTwitchUsername(
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
    .setColor(TWITCH_COLOR)
    .setTitle(
      result.created
        ? `Now watching ${result.user.username} on Twitch`
        : `Updated ${result.user.username} on Twitch`
    )
    .setURL(twitchChannelUrlFor(result.user.username))
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
  const username = normalizeTwitchUsername(
    interaction.options.getString('username', true)
  );
  const removed = await store.remove(username);

  await interaction.reply({
    content: removed
      ? `Removed ${username} from the Twitch watch list.`
      : `${username} was not on the Twitch watch list.`,
    flags: MessageFlags.Ephemeral
  });
}

async function handleList(interaction, store) {
  const users = await store.list();
  const embed = new EmbedBuilder()
    .setColor(TWITCH_COLOR)
    .setTitle('Watched Twitch Accounts')
    .setDescription(summarizeUsers(users));

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral
  });
}

async function handleCheck(interaction, checker) {
  const username = normalizeTwitchUsername(
    interaction.options.getString('username', true)
  );

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral
  });

  const status = await checker.fetchStatus(username);
  const url = status.channelUrl ?? twitchChannelUrlFor(username);
  const displayName = status.hostName ?? username;
  const embed = new EmbedBuilder()
    .setColor(status.isLive ? TWITCH_COLOR : 0x5865f2)
    .setTitle(
      status.isLive
        ? truncateText(status.title ?? `${displayName} is live on Twitch`, 256)
        : `${displayName} is not live on Twitch right now`
    )
    .setURL(url)
    .addFields({
      name: 'Link',
      value: `[Open Twitch](${url})`
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
          status.description ?? 'Tap through to watch the stream.',
          4096
        )
      );

    if (status.gameName) {
      embed.addFields({
        name: 'Game',
        value: truncateText(status.gameName, 1024)
      });
    }

    if (status.startedAt) {
      embed.addFields({
        name: 'Started',
        value: `<t:${Math.floor(
          new Date(status.startedAt).getTime() / 1000
        )}:R>`
      });
    }
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

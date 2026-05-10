require("dotenv").config();

const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const Database = require("better-sqlite3");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_IDS = (process.env.GUILD_IDS || process.env.GUILD_ID || "")
  .split(/[,\s]+/)
  .map((guildId) => guildId.trim())
  .filter(Boolean);
const OWNER_ID = process.env.OWNER_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET || process.env.DISCORD_CLIENT_SECRET;
const DASHBOARD_URL = process.env.DASHBOARD_URL;
const PORT = Number(process.env.PORT || 3000);

if (!TOKEN || !CLIENT_ID || !OWNER_ID) {
  throw new Error("Missing required env vars: DISCORD_TOKEN/TOKEN, CLIENT_ID, OWNER_ID");
}

const ROOT = __dirname;
const LEAKS_DIR = path.join(ROOT, "leaks");
const DB_PATH = path.join(ROOT, "vault.sqlite");
const NORMAL_ROLE = "13 Vault";
const BOOSTER_ROLE = "Vault Booster";
const LEAK_PINGS_ROLE = "Leak Pings";
const OWNER_ROLE = "Owner";
const OWNER_GRANT_USER_ID = "1437330292196118568";
const GENERAL_CHAT = "💬 general-chat";
const ANNOUNCEMENTS_CHANNEL = "📢-announcements";
const RULES_CHANNEL = "📜-rules";
const VERIFY_CHANNEL = "✅-verify";
const GIVEAWAY_CHANNEL = "🎉-giveaways";
const MODLOG_CHANNEL = "🛡️-mod-log";
const SPAM_WINDOW_MS = 7000;
const SPAM_MESSAGE_LIMIT = 5;
const SPAM_TIMEOUT_MS = 5 * 60 * 1000;

const normalCategories = [
  { key: "ticket-0027", label: "ticket-0027", channel: "📢 ticket-0027", emoji: "📢" },
  { key: "bundles", label: "bundles", channel: "📦 bundles", emoji: "📦" },
  { key: "graphics-pack", label: "graphics-pack", channel: "🖼️ graphics-pack", emoji: "🖼️" },
  { key: "sound-packs", label: "sound-packs", channel: "🔊 sound-packs", emoji: "🔊" },
  { key: "reshades", label: "reshades", channel: "🌫️ reshades", emoji: "🌫️" },
  { key: "intros", label: "intros", channel: "🎬 intros", emoji: "🎬" },
  { key: "tracers", label: "tracers", channel: "🔫 tracers", emoji: "🔫" },
  { key: "other", label: "other", channel: "📁 other", emoji: "📁" },
];

const boosterCategories = [
  { key: "booster-preview", label: "BOoster-preview", channel: "🚀 BOoster-preview", emoji: "🚀" },
  { key: "booster-perks", label: "BOoster-perks", channel: "🚀 BOoster-perks", emoji: "🚀" },
  { key: "booster-bundles", label: "bundles", channel: "🚀 bundles", emoji: "🚀" },
  { key: "booster-graphic-packs", label: "graphic-packs", channel: "🚀 graphic-packs", emoji: "🚀" },
  { key: "booster-snow-graphic-packs", label: "snow-graphic-packs", channel: "🚀 snow-graphic-packs", emoji: "🚀" },
  { key: "booster-fps-graphic-packs", label: "fps-graphic-packs", channel: "🚀 fps-graphic-packs", emoji: "🚀" },
  { key: "booster-sound-packs", label: "sound-packs", channel: "🚀 sound-packs", emoji: "🚀" },
  { key: "booster-rifle-sound-packs", label: "rifle-sound-packs", channel: "🚀 rifle-sound-packs", emoji: "🚀" },
  { key: "booster-kos-sound-packs", label: "kos-sound-packs", channel: "🚀 kos-sound-packs", emoji: "🚀" },
  { key: "booster-nvidia-amd-settings", label: "nvidia-amd-settings", channel: "🚀 nvidia-amd-settings", emoji: "🚀" },
  { key: "booster-spotify-premium", label: "spotify-premium", channel: "🚀 spotify-premium", emoji: "🚀" },
  { key: "booster-d10-graphicpacks", label: "d10-graphicpacks", channel: "🚀 d10-graphicpacks", emoji: "🚀" },
  { key: "booster-playlists", label: "playlists", channel: "🚀 playlists", emoji: "🚀" },
  { key: "booster-d10-soundpacks", label: "d10-soundpacks", channel: "🚀 d10-soundpacks", emoji: "🚀" },
  { key: "booster-d10-reshades", label: "d10-reshades", channel: "🚀 d10-reshades", emoji: "🚀" },
  { key: "booster-extras", label: "extras", channel: "🚀 extras", emoji: "🚀" },
];

const allCategories = [...normalCategories, ...boosterCategories];
const categoryByKey = new Map(allCategories.map((category) => [category.key, category]));

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS leaks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    content_type TEXT,
    size INTEGER,
    uploaded_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_leaks_category_created ON leaks(category, created_at);

  CREATE TABLE IF NOT EXISTS giveaways (
    message_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    prize TEXT NOT NULL,
    winner_count INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    ended INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS giveaway_entries (
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (message_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS blacklisted_users (
    user_id TEXT PRIMARY KEY,
    reason TEXT,
    added_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

const insertLeak = db.prepare(`
  INSERT INTO leaks (category, original_name, stored_name, file_path, content_type, size, uploaded_by, created_at)
  VALUES (@category, @originalName, @storedName, @filePath, @contentType, @size, @uploadedBy, @createdAt)
`);
const getLeaks = db.prepare("SELECT * FROM leaks WHERE category = ? ORDER BY created_at DESC");
const countLeaks = db.prepare("SELECT COUNT(*) AS count FROM leaks WHERE category = ?");
const countAllLeaks = db.prepare("SELECT COUNT(*) AS count FROM leaks");
const countBoosterLeaks = db.prepare(`SELECT COUNT(*) AS count FROM leaks WHERE category LIKE 'booster-%'`);
const newestLeak = db.prepare("SELECT * FROM leaks ORDER BY created_at DESC LIMIT 1");
const latestLeaks = db.prepare("SELECT * FROM leaks ORDER BY created_at DESC LIMIT ?");
const getLeakById = db.prepare("SELECT * FROM leaks WHERE id = ?");
const deleteLeakById = db.prepare("DELETE FROM leaks WHERE id = ?");
const renameLeakById = db.prepare("UPDATE leaks SET original_name = @name WHERE id = @id");
const insertGiveaway = db.prepare(`
  INSERT INTO giveaways (message_id, channel_id, prize, winner_count, ends_at, created_by, created_at)
  VALUES (@messageId, @channelId, @prize, @winnerCount, @endsAt, @createdBy, @createdAt)
`);
const getGiveaway = db.prepare("SELECT * FROM giveaways WHERE message_id = ?");
const getOpenGiveaways = db.prepare("SELECT * FROM giveaways WHERE ended = 0");
const endGiveawayById = db.prepare("UPDATE giveaways SET ended = 1 WHERE message_id = ?");
const insertGiveawayEntry = db.prepare(`
  INSERT OR IGNORE INTO giveaway_entries (message_id, user_id, created_at)
  VALUES (?, ?, ?)
`);
const countGiveawayEntries = db.prepare("SELECT COUNT(*) AS count FROM giveaway_entries WHERE message_id = ?");
const getGiveawayEntries = db.prepare("SELECT user_id FROM giveaway_entries WHERE message_id = ?");
const getBlacklistEntry = db.prepare("SELECT * FROM blacklisted_users WHERE user_id = ?");
const addBlacklistEntry = db.prepare(`
  INSERT INTO blacklisted_users (user_id, reason, added_by, created_at)
  VALUES (@userId, @reason, @addedBy, @createdAt)
  ON CONFLICT(user_id) DO UPDATE SET reason = excluded.reason, added_by = excluded.added_by, created_at = excluded.created_at
`);
const removeBlacklistEntry = db.prepare("DELETE FROM blacklisted_users WHERE user_id = ?");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const spamTracker = new Map();
const dashboardSessions = new Map();
const oauthStates = new Map();
const pendingChannelUploads = new Map();

function brandEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x130000)
    .setTitle(`13BPZ Vault | ${title}`)
    .setDescription(description)
    .setFooter({ text: "13BPZ Vault // locked, loaded, leaked" })
    .setTimestamp();
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatLeakRow(row) {
  const category = categoryByKey.get(row.category);
  return `#${row.id} | ${category?.emoji || "📁"} **${category?.label || row.category}** | ${row.original_name} | ${formatBytes(row.size)}`;
}

function parseDuration(text) {
  const match = /^(\d+)(m|h|d)$/i.exec(text.trim());
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanFileName(name) {
  return name
    .replace(/[^\w.\-()[\] ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function findOrCreateRole(guild, name, color, reason) {
  let role = guild.roles.cache.find((guildRole) => guildRole.name === name);
  if (!role) {
    role = await guild.roles.create({ name, color, reason });
  }
  return role;
}

async function findOrCreateOwnerRole(guild) {
  let role = guild.roles.cache.find((guildRole) => guildRole.name === OWNER_ROLE);
  if (!role) {
    role = await guild.roles.create({
      name: OWNER_ROLE,
      color: 0xff0000,
      permissions: [PermissionFlagsBits.Administrator],
      reason: "13BPZ Vault owner role grant",
    });
  }
  return role;
}

async function findOrCreateCategory(guild, name, overwrites, reason) {
  let category = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildCategory && channel.name === name,
  );

  if (!category) {
    category = await guild.channels.create({
      name,
      type: ChannelType.GuildCategory,
      permissionOverwrites: overwrites,
      reason,
    });
  } else {
    await category.permissionOverwrites.set(overwrites, reason);
  }

  return category;
}

async function findOrCreateTextChannel(guild, parent, name, overwrites, reason) {
  await guild.channels.fetch();

  let channel = guild.channels.cache.find(
    (guildChannel) =>
      guildChannel.type === ChannelType.GuildText &&
      guildChannel.parentId === (parent?.id || null) &&
      normalizedDiscordName(guildChannel.name) === normalizedDiscordName(name),
  );

  if (!channel) {
    channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: parent || undefined,
      permissionOverwrites: overwrites,
      reason,
    });
  } else {
    await channel.permissionOverwrites.set(overwrites, reason);
  }

  return channel;
}

async function findOrCreateInfoChannel(guild, name, reason) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads,
        PermissionFlagsBits.AddReactions,
      ],
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  return findOrCreateTextChannel(guild, null, name, overwrites, reason);
}

async function findOrCreateModLogChannel(guild) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  return findOrCreateTextChannel(guild, null, MODLOG_CHANNEL, overwrites, "13BPZ Vault mod log channel");
}

async function lockTextChannelsExceptGeneral(guild, generalChannel, vaultRole, boosterRole) {
  await guild.channels.fetch();

  const channels = guild.channels.cache.filter(
    (channel) => channel.type === ChannelType.GuildText && channel.id !== generalChannel.id,
  );

  for (const channel of channels.values()) {
    await channel.permissionOverwrites.edit(guild.roles.everyone, {
      SendMessages: false,
      SendMessagesInThreads: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
      AddReactions: false,
    }, { reason: "13BPZ Vault setup: read-only outside general chat" });

    await channel.permissionOverwrites.edit(vaultRole, {
      SendMessages: false,
      SendMessagesInThreads: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
      AddReactions: false,
    }, { reason: "13BPZ Vault setup: read-only outside general chat" });

    await channel.permissionOverwrites.edit(boosterRole, {
      SendMessages: false,
      SendMessagesInThreads: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
      AddReactions: false,
    }, { reason: "13BPZ Vault setup: read-only outside general chat" });

    await channel.permissionOverwrites.edit(guild.members.me, {
      ViewChannel: true,
      SendMessages: true,
      AttachFiles: true,
      ReadMessageHistory: true,
    }, { reason: "13BPZ Vault setup: bot can post leaks" });
  }

  return channels.size;
}

async function addRoleIfPossible(member, roleName) {
  const role = member.guild.roles.cache.find((guildRole) => guildRole.name === roleName);
  if (!role || member.roles.cache.has(role.id)) return false;
  await member.roles.add(role, `13BPZ Vault auto role: ${roleName}`);
  return true;
}

function requireOwner(interaction) {
  return interaction.user.id === OWNER_ID;
}

function isOwnerOrMod(interaction) {
  return requireOwner(interaction) || interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
}

function hasRole(member, roleName) {
  return member.roles.cache.some((role) => role.name === roleName);
}

function isBlacklisted(userId) {
  return Boolean(getBlacklistEntry.get(userId));
}

function findGeneralChannel(guild) {
  return guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildText && channel.name === GENERAL_CHAT,
  );
}

function normalizedDiscordName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function categoryParentName(categoryKey) {
  return boosterCategories.some((category) => category.key === categoryKey) ? "BOOSTER LEAKS" : "13 VAULT";
}

async function findLeakPostChannel(guild, category) {
  await guild.channels.fetch();

  const parentName = categoryParentName(category.key);
  const parent = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildCategory && channel.name === parentName,
  );

  const wantedNames = new Set([
    normalizedDiscordName(category.channel),
    normalizedDiscordName(category.label),
    normalizedDiscordName(category.key),
  ]);

  return guild.channels.cache.find((channel) => {
    if (channel.type !== ChannelType.GuildText) return false;
    if (parent && channel.parentId !== parent.id) return false;

    const channelName = normalizedDiscordName(channel.name);
    return wantedNames.has(channelName) || channelName.endsWith(normalizedDiscordName(category.label));
  });
}

async function runSetup(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!requireOwner(interaction)) {
    await interaction.editReply({ embeds: [brandEmbed("Denied", "Owner only. This vault does not open for random hands.")] });
    return;
  }

  const { guild } = interaction;
  const everyone = guild.roles.everyone;
  const vaultRole = await findOrCreateRole(guild, NORMAL_ROLE, 0x2b2d31, "13BPZ Vault setup");
  const boosterRole = await findOrCreateRole(guild, BOOSTER_ROLE, 0xff3b3b, "13BPZ Vault setup");
  await findOrCreateRole(guild, LEAK_PINGS_ROLE, 0x8b0000, "13BPZ Vault setup");

  const normalOverwrites = [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.AddReactions] },
    { id: vaultRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.AddReactions] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles] },
  ];

  const boosterOverwrites = [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.AddReactions] },
    { id: boosterRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.AddReactions] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles] },
  ];

  const generalOverwrites = [
    { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads] },
    { id: vaultRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: boosterRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
  ];

  const normalCategory = await findOrCreateCategory(guild, "13 VAULT", normalOverwrites, "13BPZ Vault setup");
  const boosterCategory = await findOrCreateCategory(guild, "BOOSTER LEAKS", boosterOverwrites, "13BPZ Vault setup");
  const generalChannel = await findOrCreateTextChannel(guild, null, GENERAL_CHAT, generalOverwrites, "13BPZ Vault setup");

  for (const category of normalCategories) {
    await findOrCreateTextChannel(guild, normalCategory, category.channel, normalOverwrites, "13BPZ Vault setup");
    await ensureDir(path.join(LEAKS_DIR, category.key));
  }

  for (const category of boosterCategories) {
    await findOrCreateTextChannel(guild, boosterCategory, category.channel, boosterOverwrites, "13BPZ Vault setup");
    await ensureDir(path.join(LEAKS_DIR, category.key));
  }

  const lockedChannels = await lockTextChannelsExceptGeneral(guild, generalChannel, vaultRole, boosterRole);

  await interaction.editReply({
    embeds: [
      brandEmbed(
        "Setup Complete",
        [
          `Created or verified roles: **${NORMAL_ROLE}**, **${BOOSTER_ROLE}**`,
          "Created or verified categories: **13 VAULT**, **BOOSTER LEAKS**",
          `General chat: ${generalChannel}`,
          `Locked messaging in **${lockedChannels}** text channels outside general chat.`,
          `Prepared **${normalCategories.length + boosterCategories.length}** leak folders.`,
        ].join("\n"),
      ),
    ],
  });
}

async function runLockChannels(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!requireOwner(interaction)) {
    await interaction.editReply({ embeds: [brandEmbed("Denied", "Owner only. Channel locks are not for random hands.")] });
    return;
  }

  const { guild } = interaction;
  const vaultRole = await findOrCreateRole(guild, NORMAL_ROLE, 0x2b2d31, "13BPZ Vault channel lock");
  const boosterRole = await findOrCreateRole(guild, BOOSTER_ROLE, 0xff3b3b, "13BPZ Vault channel lock");
  await findOrCreateRole(guild, LEAK_PINGS_ROLE, 0x8b0000, "13BPZ Vault channel lock");
  const generalOverwrites = [
    { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads] },
    { id: vaultRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: boosterRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
  ];

  const generalChannel = await findOrCreateTextChannel(guild, null, GENERAL_CHAT, generalOverwrites, "13BPZ Vault channel lock");
  const lockedChannels = await lockTextChannelsExceptGeneral(guild, generalChannel, vaultRole, boosterRole);

  await interaction.editReply({
    embeds: [
      brandEmbed(
        "Channels Locked",
        [
          `General chat: ${generalChannel}`,
          `Locked messaging in **${lockedChannels}** text channels outside general chat.`,
          "Users can chat in general only. The bot can still post leaks in vault channels.",
        ].join("\n"),
      ),
    ],
  });
}

async function grantOwnerRole(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (interaction.user.id !== OWNER_GRANT_USER_ID) {
    await interaction.editReply({ embeds: [brandEmbed("Denied", "This command is locked to the approved owner ID.")] });
    return;
  }

  const role = await findOrCreateOwnerRole(interaction.guild);
  if (interaction.member.roles.cache.has(role.id)) {
    await interaction.editReply({ embeds: [brandEmbed("Owner Ready", `You already have **${OWNER_ROLE}**.`)] });
    return;
  }

  await interaction.member.roles.add(role, "13BPZ Vault /owner command");
  await interaction.editReply({ embeds: [brandEmbed("Owner Granted", `Gave you the **${OWNER_ROLE}** role.`)] });
}

async function downloadAttachmentFile(attachment, folderKey) {
  const categoryDir = path.join(LEAKS_DIR, folderKey);
  await ensureDir(categoryDir);

  const response = await fetch(attachment.url);
  if (!response.ok) {
    throw new Error(`Failed to download ${attachment.name}: HTTP ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const timestamp = Date.now();
  const safeName = cleanFileName(attachment.name || "leak.bin");
  const storedName = `${timestamp}_${safeName}`;
  const filePath = path.join(categoryDir, storedName);

  await fs.writeFile(filePath, bytes);

  return {
    originalName: attachment.name || "leak.bin",
    storedName,
    filePath,
    contentType: attachment.contentType || null,
    size: attachment.size || bytes.length,
  };
}

async function downloadAttachment(attachment, categoryKey, uploaderId) {
  const savedFile = await downloadAttachmentFile(attachment, categoryKey);

  insertLeak.run({
    category: categoryKey,
    originalName: savedFile.originalName,
    storedName: savedFile.storedName,
    filePath: savedFile.filePath,
    contentType: savedFile.contentType,
    size: savedFile.size,
    uploadedBy: uploaderId,
    createdAt: Date.now(),
  });

  return savedFile;
}

async function postLeaksToChannel(channel, category, savedFiles, uploader) {
  const sent = [];
  const failed = [];
  const permissions = channel.permissionsFor(channel.guild.members.me);

  if (!permissions?.has(PermissionFlagsBits.ViewChannel)) {
    return {
      sentCount: 0,
      failedCount: savedFiles.length,
      failedReasons: [`Missing View Channel permission in #${channel.name}`],
    };
  }

  if (!permissions.has(PermissionFlagsBits.SendMessages)) {
    return {
      sentCount: 0,
      failedCount: savedFiles.length,
      failedReasons: [`Missing Send Messages permission in #${channel.name}`],
    };
  }

  if (!permissions.has(PermissionFlagsBits.AttachFiles)) {
    return {
      sentCount: 0,
      failedCount: savedFiles.length,
      failedReasons: [`Missing Attach Files permission in #${channel.name}`],
    };
  }

  for (const file of savedFiles) {
    try {
      const pingRole = channel.guild.roles.cache.find((role) => role.name === LEAK_PINGS_ROLE);
      const message = await channel.send({
        content: pingRole && sent.length === 0 ? `${pingRole}` : undefined,
        allowedMentions: pingRole ? { roles: [pingRole.id] } : undefined,
        files: [new AttachmentBuilder(file.filePath, { name: file.originalName })],
      });
      sent.push(message.id);
    } catch (error) {
      console.error(`Failed to post leaks to #${channel.name}:`, error);
      failed.push(`${file.originalName}: ${error.message}`);
    }
  }

  return {
    sentCount: sent.length,
    failedCount: failed.length,
    failedReasons: failed.slice(0, 3),
  };
}

async function addLeak(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (isBlacklisted(interaction.user.id)) {
    await interaction.editReply({ embeds: [brandEmbed("Blocked", "You are blacklisted from vault commands.")] });
    return;
  }

  if (!requireOwner(interaction)) {
    await interaction.editReply({ embeds: [brandEmbed("Denied", "Owner only. Leak uploads are locked to the vault boss.")] });
    return;
  }

  const categoryKey = interaction.options.getString("category", true);
  const category = categoryByKey.get(categoryKey);
  if (!category) {
    await interaction.editReply({ embeds: [brandEmbed("Bad Category", "That category does not exist in the vault map.")] });
    return;
  }

  const attachments = [];
  for (let index = 1; index <= 10; index += 1) {
    const attachment = interaction.options.getAttachment(`file${index}`);
    if (attachment) attachments.push(attachment);
  }

  if (attachments.length === 0) {
    await interaction.editReply({ embeds: [brandEmbed("No Files", "Attach at least one file or video.")] });
    return;
  }

  const saved = [];
  const failed = [];

  for (const attachment of attachments) {
    try {
      saved.push(await downloadAttachment(attachment, categoryKey, interaction.user.id));
    } catch (error) {
      console.error(error);
      failed.push(`${attachment.name}: ${error.message}`);
    }
  }

  let postedText = "Posted to channel: **No**";
  if (saved.length) {
    const targetChannel = await findLeakPostChannel(interaction.guild, category);

    if (targetChannel) {
      const posted = await postLeaksToChannel(targetChannel, category, saved, interaction.user);
      postedText = `Posted to channel: ${targetChannel} (**${posted.sentCount}** message${posted.sentCount === 1 ? "" : "s"})`;
      if (posted.failedCount) postedText += `\nChannel post failures: **${posted.failedCount}** file${posted.failedCount === 1 ? "" : "s"}`;
      if (posted.failedReasons?.length) postedText += `\nReason: ${posted.failedReasons.join(" | ")}`;
    } else {
      postedText = `Posted to channel: **No**\nCould not find the matching Discord channel. Run **/setup** again or check the channel name: **${category.channel}**`;
    }
  }

  await interaction.editReply({
    embeds: [
      brandEmbed(
        "Leak Added",
        [
          `Category: **${category.emoji} ${category.label}**`,
          `Files saved: **${saved.length}**`,
          postedText,
          failed.length ? `Failed: **${failed.length}**` : "Failed: **0**",
        ].join("\n"),
      ),
    ],
  });
}

async function sendFileToChosenChannel(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (isBlacklisted(interaction.user.id)) {
    await interaction.editReply({ embeds: [brandEmbed("Blocked", "You are blacklisted from vault commands.")] });
    return;
  }

  if (!isOwnerOrMod(interaction)) {
    await interaction.editReply({ embeds: [brandEmbed("Denied", "Owner or mod only.")] });
    return;
  }

  const attachments = [];
  for (let index = 1; index <= 10; index += 1) {
    const attachment = interaction.options.getAttachment(`file${index}`);
    if (attachment) attachments.push(attachment);
  }

  if (attachments.length === 0) {
    await interaction.editReply({ embeds: [brandEmbed("No Files", "Attach at least one file or video.")] });
    return;
  }

  const saved = [];
  const failed = [];
  const folderKey = path.join("custom-uploads", interaction.guild.id);

  for (const attachment of attachments) {
    try {
      saved.push(await downloadAttachmentFile(attachment, folderKey));
    } catch (error) {
      console.error(error);
      failed.push(`${attachment.name}: ${error.message}`);
    }
  }

  if (!saved.length) {
    await interaction.editReply({
      embeds: [brandEmbed("Upload Failed", `No files could be saved.\n${failed.slice(0, 3).join("\n")}`)],
    });
    return;
  }

  const token = crypto.randomBytes(8).toString("hex");
  pendingChannelUploads.set(token, {
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    files: saved,
    failed,
    createdAt: Date.now(),
  });
  setTimeout(() => pendingChannelUploads.delete(token), 15 * 60 * 1000).unref();

  const menu = new ChannelSelectMenuBuilder()
    .setCustomId(`channelupload:${token}`)
    .setPlaceholder("Pick the channel to send these files")
    .setMinValues(1)
    .setMaxValues(1)
    .addChannelTypes(ChannelType.GuildText);

  await interaction.editReply({
    embeds: [
      brandEmbed(
        "Choose Channel",
        [
          `Files ready: **${saved.length}**`,
          failed.length ? `Failed to save: **${failed.length}**` : "Failed to save: **0**",
          "Pick one of this server's text channels below.",
        ].join("\n"),
      ),
    ],
    components: [new ActionRowBuilder().addComponents(menu)],
  });
}

async function handleChannelUploadSelect(interaction) {
  await interaction.deferUpdate();

  const token = interaction.customId.split(":")[1];
  const session = pendingChannelUploads.get(token);
  if (!session) {
    await interaction.editReply({
      embeds: [brandEmbed("Expired", "That upload picker expired. Run /sendfile again.")],
      components: [],
    });
    return;
  }

  if (session.userId !== interaction.user.id) {
    await interaction.followUp({ ephemeral: true, embeds: [brandEmbed("Locked", "This channel picker belongs to another user.")] });
    return;
  }

  if (session.guildId !== interaction.guild.id) {
    await interaction.editReply({ embeds: [brandEmbed("Wrong Server", "That upload was started in another server.")], components: [] });
    return;
  }

  const channelId = interaction.values[0];
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.editReply({ embeds: [brandEmbed("Bad Channel", "Pick a normal text channel.")], components: [] });
    return;
  }

  const posted = await postLeaksToChannel(channel, { label: channel.name }, session.files, interaction.user);
  pendingChannelUploads.delete(token);

  await interaction.editReply({
    embeds: [
      brandEmbed(
        "Files Sent",
        [
          `Channel: ${channel}`,
          `Posted: **${posted.sentCount}** file${posted.sentCount === 1 ? "" : "s"}`,
          posted.failedCount ? `Failed to post: **${posted.failedCount}**` : "Failed to post: **0**",
          posted.failedReasons?.length ? `Reason: ${posted.failedReasons.join(" | ")}` : null,
          session.failed.length ? `Upload save failures: **${session.failed.length}**` : null,
        ].filter(Boolean).join("\n"),
      ),
    ],
    components: [],
  });
}

async function announce(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!requireOwner(interaction)) {
    await interaction.editReply({ embeds: [brandEmbed("Denied", "Owner only. Announcements stay locked.")] });
    return;
  }

  const channel = interaction.options.getChannel("channel") ||
    await findOrCreateInfoChannel(interaction.guild, ANNOUNCEMENTS_CHANNEL, "13BPZ Vault announcement channel");
  const title = interaction.options.getString("title", true);
  const message = interaction.options.getString("message", true);

  if (channel.type !== ChannelType.GuildText) {
    await interaction.editReply({ embeds: [brandEmbed("Bad Channel", "Pick a normal text channel.")] });
    return;
  }

  await channel.send({
    embeds: [
      brandEmbed(title, message)
        .setFooter({ text: "13BPZ Vault // announcement" }),
    ],
  });

  await interaction.editReply({ embeds: [brandEmbed("Announcement Sent", `Posted in ${channel}.`)] });
}

async function clearMessages(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!isOwnerOrMod(interaction)) {
    await interaction.editReply({ embeds: [brandEmbed("Denied", "Owner or Manage Messages permission required.")] });
    return;
  }

  const amount = interaction.options.getInteger("amount", true);
  const channel = interaction.options.getChannel("channel") ||
    findGeneralChannel(interaction.guild) ||
    interaction.channel;

  if (channel.type !== ChannelType.GuildText) {
    await interaction.editReply({ embeds: [brandEmbed("Bad Channel", "Pick a normal text channel.")] });
    return;
  }

  const deleted = await channel.bulkDelete(amount, true);
  await interaction.editReply({ embeds: [brandEmbed("Messages Cleared", `Deleted **${deleted.size}** message${deleted.size === 1 ? "" : "s"} in ${channel}.`)] });
}

async function showStats(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const total = countAllLeaks.get().count;
  const boosterTotal = countBoosterLeaks.get().count;
  const newest = newestLeak.get();
  const categoryLines = allCategories
    .map((category) => {
      const row = countLeaks.get(category.key);
      return `${category.emoji} **${category.label}**: ${row.count}`;
    })
    .join("\n");

  await interaction.editReply({
    embeds: [
      brandEmbed(
        "Vault Stats",
        [
          `Total leaks: **${total}**`,
          `Booster leaks: **${boosterTotal}**`,
          newest ? `Newest: ${formatLeakRow(newest)}` : "Newest: none yet",
          "",
          categoryLines,
        ].join("\n"),
      ),
    ],
  });
}

async function showLatest(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const amount = interaction.options.getInteger("amount") || 5;
  const rows = latestLeaks.all(amount);
  const description = rows.length
    ? rows.map(formatLeakRow).join("\n")
    : "No leaks have been added yet.";

  await interaction.editReply({ embeds: [brandEmbed("Latest Leaks", description)] });
}

async function deleteLeak(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!requireOwner(interaction)) {
    await interaction.editReply({ embeds: [brandEmbed("Denied", "Owner only. Leak deletion is locked.")] });
    return;
  }

  const id = interaction.options.getInteger("id", true);
  const row = getLeakById.get(id);

  if (!row) {
    await interaction.editReply({ embeds: [brandEmbed("Not Found", `No leak found with ID **${id}**.`)] });
    return;
  }

  try {
    await fs.unlink(row.file_path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  deleteLeakById.run(id);
  await interaction.editReply({ embeds: [brandEmbed("Leak Deleted", formatLeakRow(row))] });
}

async function renameLeak(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!requireOwner(interaction)) {
    await interaction.editReply({ embeds: [brandEmbed("Denied", "Owner only. Leak rename is locked.")] });
    return;
  }

  const id = interaction.options.getInteger("id", true);
  const name = cleanFileName(interaction.options.getString("name", true));
  const row = getLeakById.get(id);

  if (!row) {
    await interaction.editReply({ embeds: [brandEmbed("Not Found", `No leak found with ID **${id}**.`)] });
    return;
  }

  renameLeakById.run({ id, name });
  await interaction.editReply({ embeds: [brandEmbed("Leak Renamed", `#${id} is now **${name}**.`)] });
}

async function toggleLeakPing(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const role = await findOrCreateRole(interaction.guild, LEAK_PINGS_ROLE, 0x8b0000, "13BPZ Vault leak ping opt-in");

  if (interaction.member.roles.cache.has(role.id)) {
    await interaction.member.roles.remove(role, "13BPZ Vault leak ping opt-out");
    await interaction.editReply({ embeds: [brandEmbed("Leak Pings Off", `Removed **${LEAK_PINGS_ROLE}**.`)] });
    return;
  }

  await interaction.member.roles.add(role, "13BPZ Vault leak ping opt-in");
  await interaction.editReply({ embeds: [brandEmbed("Leak Pings On", `Added **${LEAK_PINGS_ROLE}**. You will be pinged on new leak drops.`)] });
}

async function postRules(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!requireOwner(interaction)) {
    await interaction.editReply({ embeds: [brandEmbed("Denied", "Owner only.")] });
    return;
  }

  const channel = interaction.options.getChannel("channel") ||
    await findOrCreateInfoChannel(interaction.guild, RULES_CHANNEL, "13BPZ Vault rules channel");
  if (channel.type !== ChannelType.GuildText) {
    await interaction.editReply({ embeds: [brandEmbed("Bad Channel", "Pick a normal text channel.")] });
    return;
  }

  await channel.send({
    embeds: [
      brandEmbed(
        "Rules",
        [
          "**1. No spam.** Keep general chat clean.",
          "**2. No begging.** Drops come when they come.",
          "**3. No selling inside the vault.** Keep trades out.",
          "**4. Respect staff.** Arguing gets you removed.",
          "**5. Booster leaks stay booster.** Do not repost private drops.",
          "**6. Use common sense.** If it burns the vault, do not do it.",
        ].join("\n"),
      ),
    ],
  });

  await interaction.editReply({ embeds: [brandEmbed("Rules Posted", `Rules posted in ${channel}.`)] });
}

async function cleanVaultChannels(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!isOwnerOrMod(interaction)) {
    await interaction.editReply({ embeds: [brandEmbed("Denied", "Owner or Manage Messages permission required.")] });
    return;
  }

  await interaction.guild.channels.fetch();
  const leakChannelNames = new Set(allCategories.map((category) => normalizedDiscordName(category.channel)));
  const leakChannels = interaction.guild.channels.cache.filter(
    (channel) =>
      channel.type === ChannelType.GuildText &&
      leakChannelNames.has(normalizedDiscordName(channel.name)),
  );

  let deletedCount = 0;
  let scannedCount = 0;

  for (const channel of leakChannels.values()) {
    const messages = await channel.messages.fetch({ limit: 100 });
    scannedCount += messages.size;
    const userMessages = messages.filter((message) => !message.author.bot);
    if (!userMessages.size) continue;
    const deleted = await channel.bulkDelete(userMessages, true);
    deletedCount += deleted.size;
  }

  await interaction.editReply({
    embeds: [
      brandEmbed(
        "Vault Channels Cleaned",
        `Checked **${leakChannels.size}** leak channels, scanned **${scannedCount}** recent messages, deleted **${deletedCount}** user message${deletedCount === 1 ? "" : "s"}.`,
      ),
    ],
  });
}

async function postToGeneral(guild, embed) {
  await guild.channels.fetch();
  const channel = findGeneralChannel(guild);
  if (!channel) return false;
  await channel.send({ embeds: [embed] });
  return true;
}

async function logModeration(guild, title, description) {
  const channel = await findOrCreateModLogChannel(guild).catch(() => null);
  if (!channel) return;
  await channel.send({ embeds: [brandEmbed(title, description)] }).catch(console.error);
}

async function createModLog(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!isOwnerOrMod(interaction)) {
    await interaction.editReply({ embeds: [brandEmbed("Denied", "Owner or Manage Messages permission required.")] });
    return;
  }

  const channel = await findOrCreateModLogChannel(interaction.guild);
  await interaction.editReply({ embeds: [brandEmbed("Mod Log Ready", `Created or refreshed ${channel}.`)] });
}

async function manageBlacklist(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!isOwnerOrMod(interaction)) {
    await interaction.editReply({ embeds: [brandEmbed("Denied", "Owner or Manage Messages permission required.")] });
    return;
  }

  const action = interaction.options.getString("action", true);
  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") || "No reason provided";

  if (action === "add") {
    addBlacklistEntry.run({
      userId: user.id,
      reason,
      addedBy: interaction.user.id,
      createdAt: Date.now(),
    });
    await logModeration(interaction.guild, "User Blacklisted", `${user} was blocked from vault commands.\nReason: **${reason}**\nBy: ${interaction.user}`);
    await interaction.editReply({ embeds: [brandEmbed("Blacklisted", `${user} is now blocked from vault commands.`)] });
    return;
  }

  const removed = removeBlacklistEntry.run(user.id);
  await logModeration(interaction.guild, "User Unblacklisted", `${user} was unblocked from vault commands by ${interaction.user}.`);
  await interaction.editReply({ embeds: [brandEmbed("Blacklist Updated", removed.changes ? `${user} is unblocked.` : `${user} was not blacklisted.`)] });
}

function hasLink(content) {
  return /(https?:\/\/|discord\.gg\/|discord\.com\/invite\/|www\.)/i.test(content);
}

function shouldModerateMessage(message) {
  if (!message.guild || message.author.bot) return false;
  if (message.author.id === OWNER_ID) return false;
  if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return false;
  return message.channel.name === GENERAL_CHAT || normalizedDiscordName(message.channel.name) === normalizedDiscordName(GENERAL_CHAT);
}

async function handleGeneralModeration(message) {
  if (!shouldModerateMessage(message)) return;

  if (hasLink(message.content)) {
    await message.delete().catch(console.error);
    await logModeration(message.guild, "Link Blocked", `${message.author} posted a blocked link in ${message.channel}.\nContent: ${message.content.slice(0, 500)}`);
    await message.member?.timeout(2 * 60 * 1000, "13BPZ anti-link filter").catch(console.error);
    return;
  }

  const now = Date.now();
  const key = `${message.guild.id}:${message.author.id}`;
  const recent = (spamTracker.get(key) || []).filter((entry) => now - entry.createdAt <= SPAM_WINDOW_MS);
  recent.push({ content: message.content.toLowerCase().trim(), createdAt: now });
  spamTracker.set(key, recent);

  const repeated = recent.filter((entry) => entry.content && entry.content === recent[recent.length - 1].content).length;
  if (recent.length >= SPAM_MESSAGE_LIMIT || repeated >= 3) {
    await message.member?.timeout(SPAM_TIMEOUT_MS, "13BPZ anti-spam").catch(console.error);
    await message.delete().catch(console.error);
    spamTracker.delete(key);
    await logModeration(message.guild, "Spam Timeout", `${message.author} was timed out for spam in ${message.channel}.`);
  }
}

async function postVerify(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!requireOwner(interaction)) {
    await interaction.editReply({ embeds: [brandEmbed("Denied", "Owner only.")] });
    return;
  }

  await findOrCreateRole(interaction.guild, NORMAL_ROLE, 0x2b2d31, "13BPZ Vault verify setup");
  const channel = interaction.options.getChannel("channel") ||
    await findOrCreateInfoChannel(interaction.guild, VERIFY_CHANNEL, "13BPZ Vault verify channel");
  const button = new ButtonBuilder()
    .setCustomId("verify:13vault")
    .setLabel("Verify")
    .setStyle(ButtonStyle.Danger);

  await channel.send({
    embeds: [
      brandEmbed(
        "Verify",
        `Press the button below to unlock **${NORMAL_ROLE}**.`,
      ),
    ],
    components: [new ActionRowBuilder().addComponents(button)],
  });

  await interaction.editReply({ embeds: [brandEmbed("Verify Posted", `Verify panel posted in ${channel}.`)] });
}

async function handleVerifyButton(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const role = await findOrCreateRole(interaction.guild, NORMAL_ROLE, 0x2b2d31, "13BPZ Vault verify role");
  if (interaction.member.roles.cache.has(role.id)) {
    await interaction.editReply({ embeds: [brandEmbed("Already Verified", `You already have **${NORMAL_ROLE}**.`)] });
    return;
  }

  await interaction.member.roles.add(role, "13BPZ Vault verify button");
  await interaction.editReply({ embeds: [brandEmbed("Verified", `Unlocked **${NORMAL_ROLE}**.`)] });
}

function giveawayEmbed(giveaway, entryCount = 0) {
  const winnerCount = giveaway.winner_count ?? giveaway.winnerCount;
  const endsAt = giveaway.ends_at ?? giveaway.endsAt;

  return brandEmbed(
    "Giveaway",
    [
      `Prize: **${giveaway.prize}**`,
      `Winners: **${winnerCount}**`,
      `Ends: <t:${Math.floor(endsAt / 1000)}:R>`,
      `Entries: **${entryCount}**`,
      "",
      "Press the button below to enter.",
    ].join("\n"),
  );
}

async function createGiveaway(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!requireOwner(interaction)) {
    await interaction.editReply({ embeds: [brandEmbed("Denied", "Owner only.")] });
    return;
  }

  const prize = interaction.options.getString("prize", true);
  const durationText = interaction.options.getString("duration", true);
  const winnerCount = interaction.options.getInteger("winners") || 1;
  const durationMs = parseDuration(durationText);

  if (!durationMs) {
    await interaction.editReply({ embeds: [brandEmbed("Bad Duration", "Use a duration like `10m`, `2h`, or `1d`.")] });
    return;
  }

  const channel = interaction.options.getChannel("channel") ||
    await findOrCreateInfoChannel(interaction.guild, GIVEAWAY_CHANNEL, "13BPZ Vault giveaway channel");
  const endsAt = Date.now() + durationMs;
  const button = new ButtonBuilder()
    .setCustomId("giveaway:enter")
    .setLabel("Enter Giveaway")
    .setStyle(ButtonStyle.Success);

  const message = await channel.send({
    embeds: [giveawayEmbed({ prize, winnerCount, ends_at: endsAt }, 0)],
    components: [new ActionRowBuilder().addComponents(button)],
  });

  insertGiveaway.run({
    messageId: message.id,
    channelId: channel.id,
    prize,
    winnerCount,
    endsAt,
    createdBy: interaction.user.id,
    createdAt: Date.now(),
  });

  scheduleGiveawayEnd(message.id, Math.max(1000, endsAt - Date.now()));
  await interaction.editReply({ embeds: [brandEmbed("Giveaway Started", `Posted in ${channel} for **${prize}**.`)] });
}

async function handleGiveawayButton(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const giveaway = getGiveaway.get(interaction.message.id);
  if (!giveaway || giveaway.ended) {
    await interaction.editReply({ embeds: [brandEmbed("Giveaway Closed", "This giveaway is already closed.")] });
    return;
  }

  if (Date.now() >= giveaway.ends_at) {
    await endGiveaway(giveaway.message_id);
    await interaction.editReply({ embeds: [brandEmbed("Giveaway Closed", "This giveaway just ended.")] });
    return;
  }

  const result = insertGiveawayEntry.run(giveaway.message_id, interaction.user.id, Date.now());
  const entryCount = countGiveawayEntries.get(giveaway.message_id).count;

  await interaction.message.edit({
    embeds: [giveawayEmbed(giveaway, entryCount)],
  }).catch(console.error);

  await interaction.editReply({
    embeds: [brandEmbed(result.changes ? "Entered" : "Already Entered", result.changes ? `You entered **${giveaway.prize}**.` : "You are already entered.")],
  });
}

async function endGiveaway(messageId) {
  const giveaway = getGiveaway.get(messageId);
  if (!giveaway || giveaway.ended) return;

  const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    endGiveawayById.run(messageId);
    return;
  }

  const entries = getGiveawayEntries.all(messageId).map((row) => row.user_id);
  const winners = [...entries].sort(() => Math.random() - 0.5).slice(0, giveaway.winner_count);
  const entryCount = entries.length;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  const endedButton = new ButtonBuilder()
    .setCustomId("giveaway:ended")
    .setLabel("Giveaway Ended")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  if (message) {
    await message.edit({
      embeds: [
        brandEmbed(
          "Giveaway Ended",
          [
            `Prize: **${giveaway.prize}**`,
            `Entries: **${entryCount}**`,
            winners.length ? `Winner${winners.length === 1 ? "" : "s"}: ${winners.map((id) => `<@${id}>`).join(", ")}` : "No valid entries.",
          ].join("\n"),
        ),
      ],
      components: [new ActionRowBuilder().addComponents(endedButton)],
    }).catch(console.error);
  }

  await channel.send({
    embeds: [
      brandEmbed(
        "Giveaway Result",
        winners.length
          ? `**${giveaway.prize}** winner${winners.length === 1 ? "" : "s"}: ${winners.map((id) => `<@${id}>`).join(", ")}`
          : `**${giveaway.prize}** ended with no entries.`,
      ),
    ],
  }).catch(console.error);

  endGiveawayById.run(messageId);
}

function scheduleGiveawayEnd(messageId, delayMs) {
  const maxDelay = 2_147_483_647;
  setTimeout(() => {
    if (delayMs > maxDelay) {
      scheduleGiveawayEnd(messageId, delayMs - maxDelay);
      return;
    }
    endGiveaway(messageId).catch(console.error);
  }, Math.min(delayMs, maxDelay));
}

function scheduleOpenGiveaways() {
  const giveaways = getOpenGiveaways.all();
  for (const giveaway of giveaways) {
    scheduleGiveawayEnd(giveaway.message_id, Math.max(1000, giveaway.ends_at - Date.now()));
  }
}

async function showVaultMenu(interaction, type) {
  await interaction.deferReply({ ephemeral: true });

  if (isBlacklisted(interaction.user.id)) {
    await interaction.editReply({ embeds: [brandEmbed("Blocked", "You are blacklisted from vault commands.")] });
    return;
  }

  const roleName = type === "booster" ? BOOSTER_ROLE : NORMAL_ROLE;
  const categories = type === "booster" ? boosterCategories : normalCategories;

  if (!hasRole(interaction.member, roleName)) {
    await interaction.editReply({
      embeds: [brandEmbed("Access Denied", `You need the **${roleName}** role to crack this vault.`)],
    });
    return;
  }

  const options = categories.map((category) => {
    const row = countLeaks.get(category.key);
    return {
      label: category.label,
      value: category.key,
      emoji: category.emoji,
      description: `${row.count} file${row.count === 1 ? "" : "s"} loaded`,
    };
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`vault:${type}:${interaction.user.id}`)
    .setPlaceholder("Pick a vault category")
    .addOptions(options);

  await interaction.editReply({
    embeds: [brandEmbed(type === "booster" ? "Booster Vault" : "13 Vault", "Choose a category. The stash drops straight into this private reply.")],
    components: [new ActionRowBuilder().addComponents(menu)],
  });
}

async function sendVaultFiles(interaction) {
  const [, type, ownerId] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ ephemeral: true, embeds: [brandEmbed("Locked", "This dropdown belongs to another user.")] });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  if (isBlacklisted(interaction.user.id)) {
    await interaction.editReply({ embeds: [brandEmbed("Blocked", "You are blacklisted from vault commands.")] });
    return;
  }

  const roleName = type === "booster" ? BOOSTER_ROLE : NORMAL_ROLE;
  if (!hasRole(interaction.member, roleName)) {
    await interaction.editReply({ embeds: [brandEmbed("Access Denied", `You need the **${roleName}** role.`)] });
    return;
  }

  const categoryKey = interaction.values[0];
  const category = categoryByKey.get(categoryKey);
  const rows = getLeaks.all(categoryKey);

  if (!rows.length) {
    await interaction.editReply({ embeds: [brandEmbed("Empty", `No files are loaded in **${category.label}** yet.`)] });
    return;
  }

  await interaction.editReply({
    embeds: [brandEmbed("Dropping Files", `Category: **${category.emoji} ${category.label}**\nFiles found: **${rows.length}**`)],
  });

  const validRows = [];
  for (const row of rows) {
    try {
      await fs.access(row.file_path);
      validRows.push(row);
    } catch {
      console.warn(`Missing tracked leak file: ${row.file_path}`);
    }
  }

  if (!validRows.length) {
    await interaction.followUp({ ephemeral: true, embeds: [brandEmbed("Missing Files", "The database has entries, but the files are missing on disk.")] });
    return;
  }

  for (let index = 0; index < validRows.length; index += 10) {
    const chunk = validRows.slice(index, index + 10);
    const files = chunk.map((row) => new AttachmentBuilder(row.file_path, { name: row.original_name }));
    await interaction.followUp({
      ephemeral: true,
      content: `13BPZ drop ${Math.floor(index / 10) + 1}/${Math.ceil(validRows.length / 10)} for **${category.label}**`,
      files,
    });
  }
}

function buildCommands() {
  const addLeakCommand = new SlashCommandBuilder()
    .setName("addleak")
    .setDescription("Owner only: add files or videos to a vault category.")
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription("Vault category")
        .setRequired(true)
        .addChoices(...allCategories.map((category) => ({
          name: `${category.emoji} ${category.label}`,
          value: category.key,
        }))),
    );

  for (let index = 1; index <= 10; index += 1) {
    addLeakCommand.addAttachmentOption((option) =>
      option
        .setName(`file${index}`)
        .setDescription(index === 1 ? "File or video to add" : `Optional extra file ${index}`)
        .setRequired(index === 1),
    );
  }

  const sendFileCommand = new SlashCommandBuilder()
    .setName("sendfile")
    .setDescription("Owner/mod: upload files, then pick an existing server channel to send them.");

  for (let index = 1; index <= 10; index += 1) {
    sendFileCommand.addAttachmentOption((option) =>
      option
        .setName(`file${index}`)
        .setDescription(index === 1 ? "File or video to send" : `Optional extra file ${index}`)
        .setRequired(index === 1),
    );
  }

  return [
    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Owner only: create 13BPZ Vault roles, categories, and channels."),
    new SlashCommandBuilder()
      .setName("lockchannels")
      .setDescription("Owner only: make every text channel read-only except general chat."),
    new SlashCommandBuilder()
      .setName("owner")
      .setDescription("Give the Owner role to the approved owner Discord ID."),
    new SlashCommandBuilder()
      .setName("announce")
      .setDescription("Owner only: create/use announcements and post a clean embed.")
      .addStringOption((option) =>
        option
          .setName("title")
          .setDescription("Announcement title")
          .setRequired(true)
          .setMaxLength(120),
      )
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Announcement message")
          .setRequired(true)
          .setMaxLength(2000),
      )
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Optional channel, defaults to/create announcements")
          .addChannelTypes(ChannelType.GuildText),
      ),
    new SlashCommandBuilder()
      .setName("clear")
      .setDescription("Owner/mod: bulk delete messages from general chat or a chosen channel.")
      .addIntegerOption((option) =>
        option
          .setName("amount")
          .setDescription("Number of recent messages to delete")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100),
      )
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Optional channel, defaults to general chat")
          .addChannelTypes(ChannelType.GuildText),
      ),
    new SlashCommandBuilder()
      .setName("stats")
      .setDescription("Show vault leak stats."),
    new SlashCommandBuilder()
      .setName("latest")
      .setDescription("Show the newest leaks.")
      .addIntegerOption((option) =>
        option
          .setName("amount")
          .setDescription("How many leaks to show")
          .setMinValue(1)
          .setMaxValue(10),
      ),
    new SlashCommandBuilder()
      .setName("deleteleak")
      .setDescription("Owner only: delete a leak from storage and database.")
      .addIntegerOption((option) =>
        option
          .setName("id")
          .setDescription("Leak ID from /latest or /stats")
          .setRequired(true)
          .setMinValue(1),
      ),
    new SlashCommandBuilder()
      .setName("renameleak")
      .setDescription("Owner only: rename a tracked leak display name.")
      .addIntegerOption((option) =>
        option
          .setName("id")
          .setDescription("Leak ID from /latest")
          .setRequired(true)
          .setMinValue(1),
      )
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("New file display name")
          .setRequired(true)
          .setMaxLength(120),
      ),
    new SlashCommandBuilder()
      .setName("leakping")
      .setDescription("Toggle the Leak Pings role for new leak alerts."),
    new SlashCommandBuilder()
      .setName("rules")
      .setDescription("Owner only: create/use rules and post the 13BPZ rules embed.")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Optional channel, defaults to/create rules")
          .addChannelTypes(ChannelType.GuildText),
      ),
    new SlashCommandBuilder()
      .setName("verify")
      .setDescription("Owner only: create/use verify and post the verify button.")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Optional channel, defaults to/create verify")
          .addChannelTypes(ChannelType.GuildText),
      ),
    new SlashCommandBuilder()
      .setName("giveaway")
      .setDescription("Owner only: create/use giveaways and start a button giveaway.")
      .addStringOption((option) =>
        option
          .setName("prize")
          .setDescription("Giveaway prize")
          .setRequired(true)
          .setMaxLength(200),
      )
      .addStringOption((option) =>
        option
          .setName("duration")
          .setDescription("Duration like 10m, 2h, or 1d")
          .setRequired(true)
          .setMaxLength(12),
      )
      .addIntegerOption((option) =>
        option
          .setName("winners")
          .setDescription("Number of winners")
          .setMinValue(1)
          .setMaxValue(10),
      )
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Optional channel, defaults to/create giveaways")
          .addChannelTypes(ChannelType.GuildText),
      ),
    new SlashCommandBuilder()
      .setName("blacklist")
      .setDescription("Owner/mod: block or unblock a user from vault commands.")
      .addStringOption((option) =>
        option
          .setName("action")
          .setDescription("Add or remove blacklist")
          .setRequired(true)
          .addChoices(
            { name: "add", value: "add" },
            { name: "remove", value: "remove" },
          ),
      )
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User to update")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Reason for blacklist")
          .setMaxLength(500),
      ),
    new SlashCommandBuilder()
      .setName("modlog")
      .setDescription("Owner/mod: create or refresh the staff moderation log channel."),
    new SlashCommandBuilder()
      .setName("cleanvaultchannels")
      .setDescription("Owner/mod: remove user messages from leak channels and keep bot leak posts."),
    addLeakCommand,
    sendFileCommand,
    new SlashCommandBuilder()
      .setName("vault")
      .setDescription("Open the normal 13 Vault leak menu."),
    new SlashCommandBuilder()
      .setName("boostervault")
      .setDescription("Open the Vault Booster leak menu."),
  ].map((command) => command.toJSON());
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const commands = buildCommands();

  if (GUILD_IDS.length) {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    console.log("Cleared global slash commands to prevent duplicate Discord command entries");

    for (const guildId of GUILD_IDS) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
      console.log(`Registered ${commands.length} guild slash commands for ${guildId}`);
    }
    return;
  }

  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log(`Registered ${commands.length} global slash commands`);
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function dashboardBaseUrl(req) {
  if (DASHBOARD_URL) return DASHBOARD_URL.replace(/\/$/, "");
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${protocol}://${req.get("host")}`;
}

function dashboardRedirectUri(req) {
  return `${dashboardBaseUrl(req)}/auth/callback`;
}

function getDashboardUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  const session = dashboardSessions.get(cookies.vault_session);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    dashboardSessions.delete(cookies.vault_session);
    return null;
  }
  return session.user;
}

function requireDashboardOwner(req, res, next) {
  const user = getDashboardUser(req);
  if (!user) {
    res.redirect("/login");
    return;
  }
  if (user.id !== OWNER_ID) {
    res.status(403).send("Denied. This dashboard is owner-only.");
    return;
  }
  req.dashboardUser = user;
  next();
}

function dashboardLoginPage(req) {
  const configured = Boolean(CLIENT_SECRET);
  const setupText = configured
    ? "Authorize with Discord to open the 13BPZ control app."
    : "Set CLIENT_SECRET and DASHBOARD_URL in Railway, then add the callback URL in Discord Developer Portal.";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>13BPZ Vault App</title>
  <style>
    body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#100f13;color:#f5f5f5}
    main{max-width:760px;margin:12vh auto;padding:32px}
    .panel{border:1px solid #30232a;background:#18161b;padding:28px;border-radius:8px}
    h1{margin:0 0 12px;font-size:34px}
    p{color:#c9c2c7;line-height:1.5}
    a.button{display:inline-block;margin-top:16px;padding:12px 16px;background:#8b0000;color:#fff;text-decoration:none;border-radius:6px;font-weight:700}
    code{background:#242027;padding:2px 5px;border-radius:4px}
  </style>
</head>
<body>
  <main>
    <section class="panel">
      <h1>13BPZ Vault App</h1>
      <p>${escapeHtml(setupText)}</p>
      ${configured ? `<a class="button" href="/auth/discord">Authorize Discord</a>` : `<p>Callback URL: <code>${escapeHtml(dashboardRedirectUri(req))}</code></p>`}
    </section>
  </main>
</body>
</html>`;
}

function dashboardPage(user) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>13BPZ Vault Dashboard</title>
  <style>
    body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#100f13;color:#f5f5f5}
    header{border-bottom:1px solid #30232a;background:#18161b;padding:18px 24px;display:flex;justify-content:space-between;align-items:center}
    main{padding:24px;display:grid;grid-template-columns:300px 1fr;gap:18px}
    .panel{border:1px solid #30232a;background:#18161b;padding:18px;border-radius:8px}
    h1,h2{margin:0 0 12px}
    button,select{width:100%;padding:10px;margin:6px 0;background:#242027;color:#fff;border:1px solid #3a3037;border-radius:6px}
    a{color:#ff6961}
    .muted{color:#b9b0b6}
    pre{white-space:pre-wrap;background:#0d0c10;padding:12px;border-radius:6px;max-height:420px;overflow:auto}
  </style>
</head>
<body>
  <header>
    <div>
      <strong>13BPZ Vault Dashboard</strong>
      <span class="muted">Authorized as ${escapeHtml(user.username)}#${escapeHtml(user.discriminator || "0")}</span>
    </div>
    <a href="/logout">Logout</a>
  </header>
  <main>
    <section class="panel">
      <h2>Servers</h2>
      <select id="guilds"></select>
      <button id="loadChannels">Load Channels</button>
      <h2>Categories</h2>
      <select id="categories"></select>
    </section>
    <section class="panel">
      <h2>App Data</h2>
      <p class="muted">This is the Discord-authorized control app foundation. Next step can add attachment scan/download/import buttons here.</p>
      <pre id="output">Loading...</pre>
    </section>
  </main>
  <script>
    async function getJson(url){ const res = await fetch(url); if(!res.ok) throw new Error(await res.text()); return res.json(); }
    async function boot(){
      const [guilds, categories, status] = await Promise.all([getJson('/api/guilds'), getJson('/api/categories'), getJson('/api/status')]);
      document.getElementById('guilds').innerHTML = guilds.map(g => '<option value="'+g.id+'">'+g.name+'</option>').join('');
      document.getElementById('categories').innerHTML = categories.map(c => '<option value="'+c.key+'">'+c.emoji+' '+c.label+'</option>').join('');
      document.getElementById('output').textContent = JSON.stringify(status, null, 2);
    }
    document.getElementById('loadChannels').onclick = async () => {
      const guildId = document.getElementById('guilds').value;
      const channels = await getJson('/api/guilds/' + guildId + '/channels');
      document.getElementById('output').textContent = JSON.stringify(channels, null, 2);
    };
    boot().catch(err => document.getElementById('output').textContent = err.message);
  </script>
</body>
</html>`;
}

async function exchangeDiscordCode(code, redirectUri) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenResponse.ok) {
    throw new Error(`Discord token exchange failed: ${tokenResponse.status}`);
  }

  const token = await tokenResponse.json();
  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });

  if (!userResponse.ok) {
    throw new Error(`Discord user fetch failed: ${userResponse.status}`);
  }

  return userResponse.json();
}

function startDashboard() {
  const app = express();

  app.get("/", (req, res) => res.redirect("/dashboard"));
  app.get("/login", (req, res) => res.send(dashboardLoginPage(req)));

  app.get("/auth/discord", (req, res) => {
    if (!CLIENT_SECRET) {
      res.status(500).send("Missing CLIENT_SECRET or DISCORD_CLIENT_SECRET env var.");
      return;
    }

    const state = crypto.randomBytes(16).toString("hex");
    oauthStates.set(state, Date.now() + 10 * 60 * 1000);
    const url = new URL("https://discord.com/api/oauth2/authorize");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", dashboardRedirectUri(req));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify guilds");
    url.searchParams.set("state", state);
    res.cookie("oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 10 * 60 * 1000 });
    res.redirect(url.toString());
  });

  app.get("/auth/callback", async (req, res) => {
    try {
      const state = req.query.state;
      const cookies = parseCookies(req.headers.cookie);
      const stateExpiry = oauthStates.get(state);
      oauthStates.delete(state);

      if (!state || state !== cookies.oauth_state || !stateExpiry || Date.now() > stateExpiry) {
        res.status(400).send("Bad OAuth state.");
        return;
      }

      const user = await exchangeDiscordCode(req.query.code, dashboardRedirectUri(req));
      if (user.id !== OWNER_ID) {
        res.status(403).send("Denied. This dashboard is owner-only.");
        return;
      }

      const sessionId = crypto.randomBytes(24).toString("hex");
      dashboardSessions.set(sessionId, { user, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
      res.cookie("vault_session", sessionId, { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
      res.redirect("/dashboard");
    } catch (error) {
      console.error(error);
      res.status(500).send("Discord authorization failed. Check CLIENT_SECRET and callback URL.");
    }
  });

  app.get("/logout", (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.vault_session) dashboardSessions.delete(cookies.vault_session);
    res.clearCookie("vault_session");
    res.redirect("/login");
  });

  app.get("/dashboard", requireDashboardOwner, (req, res) => res.send(dashboardPage(req.dashboardUser)));

  app.get("/api/status", requireDashboardOwner, (req, res) => {
    res.json({
      bot: client.user ? client.user.tag : "starting",
      guilds: client.guilds.cache.size,
      categories: allCategories.length,
      leaks: countAllLeaks.get().count,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  app.get("/api/categories", requireDashboardOwner, (req, res) => {
    res.json(allCategories.map((category) => ({
      key: category.key,
      label: category.label,
      emoji: category.emoji,
      channel: category.channel,
      files: countLeaks.get(category.key).count,
    })));
  });

  app.get("/api/guilds", requireDashboardOwner, (req, res) => {
    res.json(client.guilds.cache.map((guild) => ({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
    })));
  });

  app.get("/api/guilds/:guildId/channels", requireDashboardOwner, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) {
      res.status(404).json({ error: "Bot is not in that server." });
      return;
    }

    await guild.channels.fetch();
    res.json(guild.channels.cache
      .filter((channel) => channel.type === ChannelType.GuildText)
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        parentId: channel.parentId,
      })));
  });

  app.listen(PORT, () => {
    console.log(`13BPZ dashboard listening on port ${PORT}`);
  });
}

client.once("ready", async () => {
  await ensureDir(LEAKS_DIR);
  for (const category of allCategories) await ensureDir(path.join(LEAKS_DIR, category.key));
  await registerCommands();
  scheduleOpenGiveaways();
  console.log(`13BPZ Vault online as ${client.user.tag}`);
});

client.on("guildMemberAdd", async (member) => {
  try {
    await addRoleIfPossible(member, NORMAL_ROLE);
    if (member.premiumSince) await addRoleIfPossible(member, BOOSTER_ROLE);
    await postToGeneral(
      member.guild,
      brandEmbed(
        "New Vault Member",
        `${member} entered **13BPZ Vault** and received **${NORMAL_ROLE}**.`,
      ),
    );
  } catch (error) {
    console.error(`Failed to auto-role ${member.user.tag}:`, error);
  }
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    if (!oldMember.premiumSince && newMember.premiumSince) {
      await addRoleIfPossible(newMember, BOOSTER_ROLE);
      await postToGeneral(
        newMember.guild,
        brandEmbed(
          "Booster Vault Unlocked",
          `${newMember} boosted the server and unlocked **${BOOSTER_ROLE}**.`,
        ),
      );
    }
  } catch (error) {
    console.error(`Failed to assign booster role to ${newMember.user.tag}:`, error);
  }
});

client.on("messageCreate", async (message) => {
  try {
    await handleGeneralModeration(message);
  } catch (error) {
    console.error("Failed to moderate message:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "setup") return await runSetup(interaction);
      if (interaction.commandName === "lockchannels") return await runLockChannels(interaction);
      if (interaction.commandName === "owner") return await grantOwnerRole(interaction);
      if (interaction.commandName === "announce") return await announce(interaction);
      if (interaction.commandName === "clear") return await clearMessages(interaction);
      if (interaction.commandName === "stats") return await showStats(interaction);
      if (interaction.commandName === "latest") return await showLatest(interaction);
      if (interaction.commandName === "deleteleak") return await deleteLeak(interaction);
      if (interaction.commandName === "renameleak") return await renameLeak(interaction);
      if (interaction.commandName === "leakping") return await toggleLeakPing(interaction);
      if (interaction.commandName === "rules") return await postRules(interaction);
      if (interaction.commandName === "verify") return await postVerify(interaction);
      if (interaction.commandName === "giveaway") return await createGiveaway(interaction);
      if (interaction.commandName === "blacklist") return await manageBlacklist(interaction);
      if (interaction.commandName === "modlog") return await createModLog(interaction);
      if (interaction.commandName === "cleanvaultchannels") return await cleanVaultChannels(interaction);
      if (interaction.commandName === "addleak") return await addLeak(interaction);
      if (interaction.commandName === "sendfile") return await sendFileToChosenChannel(interaction);
      if (interaction.commandName === "vault") return await showVaultMenu(interaction, "normal");
      if (interaction.commandName === "boostervault") return await showVaultMenu(interaction, "booster");
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("vault:")) {
      return await sendVaultFiles(interaction);
    }

    if (interaction.isChannelSelectMenu() && interaction.customId.startsWith("channelupload:")) {
      return await handleChannelUploadSelect(interaction);
    }

    if (interaction.isButton() && interaction.customId === "verify:13vault") {
      return await handleVerifyButton(interaction);
    }

    if (interaction.isButton() && interaction.customId === "giveaway:enter") {
      return await handleGiveawayButton(interaction);
    }
  } catch (error) {
    console.error(error);
    const payload = {
      ephemeral: true,
      embeds: [brandEmbed("System Error", "Something snapped in the vault machinery. Check the bot logs.")],
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(console.error);
    } else {
      await interaction.reply(payload).catch(console.error);
    }
  }
});

process.on("unhandledRejection", (error) => console.error("Unhandled rejection:", error));
process.on("uncaughtException", (error) => console.error("Uncaught exception:", error));

startDashboard();
client.login(TOKEN);

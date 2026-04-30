require("dotenv").config();

const {
  ActionRowBuilder,
  AttachmentBuilder,
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

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const OWNER_ID = process.env.OWNER_ID;

if (!TOKEN || !CLIENT_ID || !OWNER_ID) {
  throw new Error("Missing required env vars: DISCORD_TOKEN/TOKEN, CLIENT_ID, OWNER_ID");
}

const ROOT = __dirname;
const LEAKS_DIR = path.join(ROOT, "leaks");
const DB_PATH = path.join(ROOT, "vault.sqlite");
const NORMAL_ROLE = "13 Vault";
const BOOSTER_ROLE = "Vault Booster";

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
`);

const insertLeak = db.prepare(`
  INSERT INTO leaks (category, original_name, stored_name, file_path, content_type, size, uploaded_by, created_at)
  VALUES (@category, @originalName, @storedName, @filePath, @contentType, @size, @uploadedBy, @createdAt)
`);
const getLeaks = db.prepare("SELECT * FROM leaks WHERE category = ? ORDER BY created_at DESC");
const countLeaks = db.prepare("SELECT COUNT(*) AS count FROM leaks WHERE category = ?");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

function brandEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x130000)
    .setTitle(`13BPZ Vault | ${title}`)
    .setDescription(description)
    .setFooter({ text: "13BPZ Vault // locked, loaded, leaked" })
    .setTimestamp();
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
  let channel = guild.channels.cache.find(
    (guildChannel) =>
      guildChannel.type === ChannelType.GuildText &&
      guildChannel.parentId === parent.id &&
      guildChannel.name === name,
  );

  if (!channel) {
    channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent,
      permissionOverwrites: overwrites,
      reason,
    });
  } else {
    await channel.permissionOverwrites.set(overwrites, reason);
  }

  return channel;
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

function hasRole(member, roleName) {
  return member.roles.cache.some((role) => role.name === roleName);
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

  const normalOverwrites = [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: vaultRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles] },
  ];

  const boosterOverwrites = [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: boosterRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles] },
  ];

  const normalCategory = await findOrCreateCategory(guild, "13 VAULT", normalOverwrites, "13BPZ Vault setup");
  const boosterCategory = await findOrCreateCategory(guild, "BOOSTER LEAKS", boosterOverwrites, "13BPZ Vault setup");

  for (const category of normalCategories) {
    await findOrCreateTextChannel(guild, normalCategory, category.channel, normalOverwrites, "13BPZ Vault setup");
    await ensureDir(path.join(LEAKS_DIR, category.key));
  }

  for (const category of boosterCategories) {
    await findOrCreateTextChannel(guild, boosterCategory, category.channel, boosterOverwrites, "13BPZ Vault setup");
    await ensureDir(path.join(LEAKS_DIR, category.key));
  }

  await interaction.editReply({
    embeds: [
      brandEmbed(
        "Setup Complete",
        [
          `Created or verified roles: **${NORMAL_ROLE}**, **${BOOSTER_ROLE}**`,
          "Created or verified categories: **13 VAULT**, **BOOSTER LEAKS**",
          `Prepared **${normalCategories.length + boosterCategories.length}** leak folders.`,
        ].join("\n"),
      ),
    ],
  });
}

async function downloadAttachment(attachment, categoryKey, uploaderId) {
  const categoryDir = path.join(LEAKS_DIR, categoryKey);
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
  insertLeak.run({
    category: categoryKey,
    originalName: attachment.name || "leak.bin",
    storedName,
    filePath,
    contentType: attachment.contentType || null,
    size: attachment.size || bytes.length,
    uploadedBy: uploaderId,
    createdAt: timestamp,
  });

  return {
    originalName: attachment.name || "leak.bin",
    storedName,
    filePath,
    size: attachment.size || bytes.length,
  };
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
      const message = await channel.send({
        content: [
          `**13BPZ ${category.emoji} ${category.label} leak drop**`,
          `Posted by **${uploader.tag}**`,
        ].join("\n"),
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

async function showVaultMenu(interaction, type) {
  await interaction.deferReply({ ephemeral: true });

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

  return [
    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Owner only: create 13BPZ Vault roles, categories, and channels."),
    addLeakCommand,
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

  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log(`Registered ${commands.length} guild slash commands for ${GUILD_ID}`);
    return;
  }

  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log(`Registered ${commands.length} global slash commands`);
}

client.once("ready", async () => {
  await ensureDir(LEAKS_DIR);
  for (const category of allCategories) await ensureDir(path.join(LEAKS_DIR, category.key));
  await registerCommands();
  console.log(`13BPZ Vault online as ${client.user.tag}`);
});

client.on("guildMemberAdd", async (member) => {
  try {
    await addRoleIfPossible(member, NORMAL_ROLE);
    if (member.premiumSince) await addRoleIfPossible(member, BOOSTER_ROLE);
  } catch (error) {
    console.error(`Failed to auto-role ${member.user.tag}:`, error);
  }
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    if (!oldMember.premiumSince && newMember.premiumSince) {
      await addRoleIfPossible(newMember, BOOSTER_ROLE);
    }
  } catch (error) {
    console.error(`Failed to assign booster role to ${newMember.user.tag}:`, error);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "setup") return await runSetup(interaction);
      if (interaction.commandName === "addleak") return await addLeak(interaction);
      if (interaction.commandName === "vault") return await showVaultMenu(interaction, "normal");
      if (interaction.commandName === "boostervault") return await showVaultMenu(interaction, "booster");
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("vault:")) {
      return await sendVaultFiles(interaction);
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

client.login(TOKEN);

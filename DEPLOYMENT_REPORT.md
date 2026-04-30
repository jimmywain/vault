# 13BPZ Vault Bot Deployment Report

## Project Location

All bot files are stored in this folder:

```txt
/Users/raylanwilks/Documents/Codex/2026-04-30/prompt-for-ai-you-are-an
```

Main files:

```txt
bot.js              Main Discord bot code
package.json        Node.js package/dependency config
.env                Local secrets and bot IDs
.gitignore          Prevents secrets/files from being uploaded
DEPLOYMENT_REPORT.md This setup guide
```

## Data Storage

When the bot runs, it creates these files/folders automatically:

```txt
leaks/              Uploaded vault files/videos
vault.sqlite        SQLite database that tracks uploaded files
vault.sqlite-wal    SQLite runtime file
vault.sqlite-shm    SQLite runtime file
```

Leak files are saved like this:

```txt
leaks/[category]/[timestamp]_[filename]
```

Example:

```txt
leaks/bundles/1714470000000_pack.zip
leaks/booster-sound-packs/1714470000000_sound.mp4
```

## Important Security Note

Your bot token was pasted into chat. You should reset it before deployment.

Go to:

```txt
Discord Developer Portal > Your Application > Bot > Reset Token
```

After resetting it, update the token in:

```txt
.env
```

And in Railway environment variables.

Never post the bot token publicly. It is the bot's password.

## Local Setup

Open a terminal in the project folder:

```bash
cd /Users/raylanwilks/Documents/Codex/2026-04-30/prompt-for-ai-you-are-an
```

Install dependencies:

```bash
npm install
```

Start the bot:

```bash
npm start
```

## Required Environment Variables

Your `.env` file should contain:

```env
DISCORD_TOKEN=your_new_bot_token
CLIENT_ID=1498635986958291004
GUILD_ID=1499320789189791817
OWNER_ID=1382370095963312201
```

For Railway, add the same values in:

```txt
Railway Project > Variables
```

## Discord Developer Portal Setup

Go to:

```txt
https://discord.com/developers/applications
```

Open your bot application.

### Bot Settings

Go to:

```txt
Bot
```

Enable these privileged gateway intents:

```txt
Server Members Intent
```

The bot needs this for:

```txt
Auto-giving 13 Vault when someone joins
Auto-giving Vault Booster when someone boosts
```

### Invite URL

Go to:

```txt
OAuth2 > URL Generator
```

Select scopes:

```txt
bot
applications.commands
```

Select bot permissions:

```txt
Manage Roles
Manage Channels
Send Messages
View Channels
Read Message History
Attach Files
Use Slash Commands
```

Use the generated URL to invite the bot to your server.

Important: the bot role must be above these roles in the Discord role list:

```txt
13 Vault
Vault Booster
```

If the bot role is lower, it cannot assign those roles.

## Railway Deployment Steps

1. Create a GitHub repo for the bot files.

2. Upload these files:

```txt
bot.js
package.json
.gitignore
DEPLOYMENT_REPORT.md
```

Do not upload `.env`.

3. Go to Railway:

```txt
https://railway.app
```

4. Create a new project.

5. Choose:

```txt
Deploy from GitHub repo
```

6. Add environment variables in Railway:

```env
DISCORD_TOKEN=your_new_bot_token
CLIENT_ID=1498635986958291004
GUILD_ID=1499320789189791817
OWNER_ID=1382370095963312201
```

7. Railway should detect Node.js automatically.

8. Start command should be:

```bash
npm start
```

9. Deploy.

10. Check Railway logs. You want to see:

```txt
Registered 5 guild slash commands
13BPZ Vault online as [bot name]
```

## First Discord Setup

After the bot is online, run this in your Discord server:

```txt
/setup
```

Only the owner ID in `.env` can use it.

This creates:

```txt
Role: 13 Vault
Role: Vault Booster
Category: 13 VAULT
Category: BOOSTER LEAKS
Channel: 💬 general-chat
All vault channels
All booster channels
All leak storage folders
```

`/setup` also makes leak channels read-only for normal members. Users can talk in `💬 general-chat`; the bot can still post leaks in the vault channels.

If the server is already set up and you only want to apply the chat lock, use:

```txt
/lockchannels
```

This does not recreate all vault channels. It only creates/refreshes `💬 general-chat` and makes every other text channel read-only for normal members.

## Adding Leaks

Use:

```txt
/addleak
```

Pick a category from the dropdown and attach files/videos.

The bot saves them to:

```txt
./leaks/[category]/
```

And tracks them in:

```txt
vault.sqlite
```

The bot also posts the attached files/videos as a normal message in the matching Discord channel.

Example:

```txt
/addleak category: reshades
```

The bot posts the uploaded leak files in:

```txt
🌫️ reshades
```

Only the owner can use `/addleak`. Regular users can see the posted leak only if they have permission to view that Discord channel.

## User Commands

Normal vault:

```txt
/vault
```

Requires:

```txt
13 Vault
```

Booster vault:

```txt
/boostervault
```

Requires:

```txt
Vault Booster
```

## Railway Storage Warning

Railway app storage can be temporary unless you attach persistent storage.

For production, add a Railway Volume so uploaded leak files and `vault.sqlite` do not disappear after redeploys.

Recommended Railway volume mount path:

```txt
/app
```

If using a different mount path, update the bot later to store files inside that mounted folder.

## Final Checklist

Before going live:

```txt
[ ] Reset the leaked bot token
[ ] Update .env with the new token
[ ] Add Railway environment variables
[ ] Enable Server Members Intent
[ ] Invite bot with correct permissions
[ ] Move bot role above 13 Vault and Vault Booster
[ ] Deploy to Railway
[ ] Run /setup
[ ] Test /addleak
[ ] Test /vault
[ ] Test /boostervault
```

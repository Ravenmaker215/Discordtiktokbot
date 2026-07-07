# TikTok Discord Live Bot

This bot watches TikTok usernames and posts in Discord when one goes live. You can manage the watch list from Discord with slash commands:

- `/tiktok add username:<name> channel:<optional> role:<optional>`
- `/tiktok remove username:<name>`
- `/tiktok list`
- `/tiktok check username:<name>`

## Setup

1. Install Node.js 22.12 or newer.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in:

   ```bash
   DISCORD_TOKEN=...
   DISCORD_CLIENT_ID=...
   DISCORD_GUILD_ID=...
   ```

4. Register the slash commands:

   ```bash
   npm run commands:deploy
   ```

5. Start the bot:

   ```bash
   npm start
   ```

## Discord App Notes

In the Discord Developer Portal, create a bot and invite it with these scopes:

- `bot`
- `applications.commands`

Useful bot permissions:

- View Channels
- Send Messages
- Embed Links
- Mention Roles if you plan to use the optional role ping

## TikTok Reliability Note

TikTok does not provide a simple official public endpoint for "is this account live?" checks. This project uses `tiktok-live-connector`, which relies on public/internal TikTok web data and may need updates if TikTok changes its site behavior.

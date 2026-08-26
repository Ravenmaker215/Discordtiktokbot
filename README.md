# TikTok and Twitch Discord Live Bot

This bot watches TikTok and Twitch usernames and posts in Discord when one goes live. You can manage the watch lists from Discord with slash commands.

- `/tiktok add username:<name> channel:<optional> role:<optional>`
- `/tiktok game username:<name> game:<name>`
- `/tiktok cleargame username:<name>`
- `/tiktok remove username:<name>`
- `/tiktok list`
- `/tiktok check username:<name>`
- `/twitch add username:<name> channel:<optional> role:<optional>`
- `/twitch remove username:<name>`
- `/twitch list`
- `/twitch check username:<name>`

Twitch alerts automatically show the stream title, preview image, and current Twitch game/category when Twitch provides one.

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

   For Twitch alerts, also add:

   ```bash
   TWITCH_CLIENT_ID=...
   TWITCH_CLIENT_SECRET=...
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

## Twitch Setup

1. Go to the Twitch Developer Console and register an application.
2. Copy the Client ID into `TWITCH_CLIENT_ID`.
3. Generate a new client secret and copy it into `TWITCH_CLIENT_SECRET`.
4. Redeploy the bot and run `npm run commands:deploy && npm start`.

Keep the Twitch client secret private, just like the Discord bot token.

# Uranium

Discord bot (discord.js v14) + Express website with Discord login.

- `server.js` website + OAuth2 (Render Web Service)
- `bot.js` Discord bot (Render Background Worker)
- Secrets go in Render Environment settings, never in GitHub.
- Redirect URI to add in Discord Developer Portal: `<PUBLIC_BASE_URL>/auth/callback`

Status: starter only. Sessions use MemoryStore (temporary).

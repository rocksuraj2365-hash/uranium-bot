# Uranium

Uranium is a Discord bot with an Express website and Discord OAuth2 dashboard.

## Render services

- `uranium-bot`: runs `node bot.js`, registers slash commands, handles prefix commands, DMs, AI, and owner-only developer tools. Its small HTTP health endpoint is served on Render's `PORT`.
- `uranium-web`: runs `node server.js`, serves the website, legal pages, Discord OAuth2 login, and dashboard APIs.

Both services are configured as Render Web Services. Keep their environment variables separate.

## Environment variables

### uranium-bot
- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `GEMINI_API_KEY`
- `AI_MODEL` (defaults to `gemini-3.8-flash`)
- `AI_FALLBACK_MODELS` (defaults to `gemini-3.6-flash,gemini-2.5-flash`)
- `OWNER_IDS`
- `OWNER_TOTP_SECRET`
- `GITHUB_TOKEN` (fine-grained PAT; grant only Contents read/write and Metadata read on the two allowlisted Uranium repositories)
- `RENDER_API_KEY`

### uranium-bot
- `DASHBOARD_API_SECRET` (same random secret as the web service)

### uranium-web
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `SESSION_SECRET`
- `PUBLIC_BASE_URL`
- `BOT_CONTROL_URL` (set to `https://uranium-bot.onrender.com`)
- `DASHBOARD_API_SECRET` (same random secret as the bot service)

Never commit secrets or paste them into Discord or chat. Add them privately in the matching Render service.

## Owner DM controls

- `!owner status`
- `!owner unlock 123456` (6-digit authenticator code; session lasts 15 minutes)
- `!owner lock`
- `!dev confirm 123456` (confirms a staged file write or deployment)

Only the configured owner ID receives developer tools. File writes and deployments require a separate, short-lived confirmation. There is no arbitrary shell execution.

## Discord setup

Enable Message Content Intent in the Discord Developer Portal if you want prefix commands and automatic AI replies in a configured server chat channel. Slash commands do not require that intent.

Set the OAuth redirect URI in the Discord Developer Portal to:

`<PUBLIC_BASE_URL>/auth/callback`

## Notes

- The website currently uses Express MemoryStore for sessions. Sessions are temporary and will be lost on restart; use a persistent session store before relying on long-lived production sessions.
- Dashboard controls are served through a session-protected web proxy and a bot API protected by `DASHBOARD_API_SECRET`. Set that same secret privately on both Render services before enabling controls.
- Render Free services can sleep when idle.

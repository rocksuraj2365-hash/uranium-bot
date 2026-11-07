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

## Server Premium access

Only the bot owner listed in `OWNER_IDS` can grant or revoke Premium access. Grants are scoped to the current Discord server and saved in that server's database record.

- `/license grant @member` or `!lic grant @member` — grant access.
- `/license revoke @member` or `!lic revoke @member` — revoke access.
- `/license access [@member]` — check access.
- `/license profile` or `!brand` — set Uranium's actual per-server nickname, avatar, banner, and bio, plus the branded embed color.
- Shortcuts: `!pgrant`, `!prevoke`, `!paccess`, and `!brand`. The `!lic` category shortcut also works, e.g. `!lic profile`.

Discord supports a bot's own guild-member profile fields separately per server. The command uses Discord's current-member endpoint, so the avatar, banner, bio, and nickname apply only to the server where the command is run. Image links must be direct HTTPS links from Discord's CDN, and images must be 8 MB or smaller. The existing owner-only bot avatar command remains a separate global account setting.

## Important: database persistence on Render Free

The current bot database is stored in `data/db.json`. Render Free web services use an ephemeral filesystem: local files are lost when the service redeploys, restarts, or spins down. That means server settings, moderation records, and Premium grants stored in this file are not safe for long-term production use. Move this data to a persistent datastore before relying on paid Premium licenses.

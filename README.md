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

- The website currently uses Express MemoryStore for sessions. Sessions are temporary and will be lost on restart; a persistent PostgreSQL/Redis session store still needs to be provisioned and configured before relying on long-lived production sessions.
- Bot JSON writes now use atomic replacement and flush on SIGTERM/SIGINT. This reduces partial writes and shutdown loss, but it does not change Render Free's ephemeral-filesystem limitation.
- Dashboard controls are served through a session-protected web proxy and a bot API protected by `DASHBOARD_API_SECRET`. Set that same secret privately on both Render services before enabling controls.
- Render Free services can sleep when idle.

## Server Premium access

Only the bot owner listed in `OWNER_IDS` can grant or revoke Premium access. Grants are scoped to the current Discord server and saved in that server's database record.

- `!premium add @member` — grant Premium access in this server (bot owner only).
- `!premium remove @member` — revoke Premium access (bot owner only).
- `!premium check [@member]` — check a member's Premium status.
- Slash equivalents remain `/license grant`, `/license revoke`, and `/license access`.
- `/license profile` or `!brand` — set Uranium's actual per-server nickname, avatar, banner, and bio, plus the branded embed color.
- Profile shortcut: `!premium profile` or `!brand`. The `!lic profile` alias remains available.

Discord supports a bot's own guild-member profile fields separately per server. The command uses Discord's current-member endpoint, so the avatar, banner, bio, and nickname apply only to the server where the command is run. Image links must be direct HTTPS links from Discord's CDN, and images must be 8 MB or smaller. The existing owner-only bot avatar command remains a separate global account setting.

## Prefix customization (free for every server)

Changing Uranium's prefix is not a Premium feature. A server member with Manage Server permission can use `!prefix ?` (or another 1-3 character prefix) or change it in the dashboard. No Premium grant is required.

## Important: database persistence on Render Free

The current bot database is stored in `data/db.json`. Render Free web services use an ephemeral filesystem: local files are lost when the service redeploys, restarts, or spins down. That means server settings, moderation records, and Premium grants stored in this file are not safe for long-term production use. Move this data to a persistent datastore before relying on paid Premium licenses.

## 100 additional prefix commands

The bot adds four slash-command groups, each with 25 working commands:

- `utility`: calculator, text tools, timestamps, Discord ID dates, server/member information, color details and more.
- `community`: welcome/goodbye setup, rules, introductions, suggestions, FAQs, birthdays and reputation.
- `fun`: games, trivia, prompts, randomizers and chat challenges.
- `servertools`: thread controls, scheduled events, channel topics, slowmode, announcements and polls.

Use either the category form (for example, `!utility calculate "(12 + 8) * 3"`, `!community rules`, `!fun rps rock`, `!servertools thread-list`) or the direct command name when it is unique (for example, `!joke`, `!coinflip`, `!server-age`). Category shortcuts are `!ut`, `!cm`, `!fn`, and `!st`. The slash equivalents are grouped under `/utility`, `/community`, `/fun`, and `/servertools`.

Welcome and goodbye messages use `{user}`, `{username}`, `{server}`, and `{memberCount}`. To enable automatic join/leave events, turn on **Server Members Intent** in the Discord Developer Portal and set `ENABLE_GUILD_MEMBERS_INTENT=true` on the bot's Render service. This is optional; the commands work without it.

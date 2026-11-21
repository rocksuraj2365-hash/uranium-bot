# Uranium Lavalink node

This folder defines the separate Lavalink v4 audio service used by the bot.

## Render service

The root `render.yaml` adds a Docker web service named `uranium-lavalink`. It uses this Dockerfile and listens on Render's `SERVER_PORT` (10000). Render assigns the public HTTPS/WSS hostname.

Set these private variables on the Lavalink service:

- `LAVALINK_SERVER_PASSWORD`: create a long, random password.
- `SPOTIFY_CLIENT_ID`: optional Spotify developer application client ID.
- `SPOTIFY_CLIENT_SECRET`: optional matching Spotify developer application secret.
- `APPLE_MUSIC_API_TOKEN`: optional Apple Music API token.

Set the matching bot-service variables:

- `LAVALINK_HOST`: hostname only, for example `uranium-lavalink.onrender.com` (no scheme).
- `LAVALINK_PORT`: `443`.
- `LAVALINK_PASSWORD`: exactly the same value as `LAVALINK_SERVER_PASSWORD`.
- `LAVALINK_SECURE`: `true`.

Do not put secrets in GitHub, chat, or public logs.

## Sources

The node loads the official Lavalink YouTube source plugin and LavaSrc. YouTube and SoundCloud search are configured, while Spotify and Apple Music links are resolved through LavaSrc's supported source matching. This does not extract or bypass DRM-protected audio streams. Deezer is disabled by default because its integration can require account credentials; do not add personal account cookies to the bot.

The existing SomaFM/Radio Paradise radio player remains available independently.

## Hosting note

The blueprint uses Render Free to avoid silently choosing a paid plan. Free services can sleep and have limited memory, so they are not a dependable always-on music backend. A paid always-on instance may be needed for reliable 24/7 playback.

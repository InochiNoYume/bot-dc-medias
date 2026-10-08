# Bot DC Medias

Multi-guild Discord bot for creator communities and development environments.

## Stack

- Node.js 22+
- TypeScript
- Discord.js v14
- Supabase PostgreSQL
- GitHub Actions / host deployment

## Principles

- Runtime secrets live in environment variables.
- Per-guild configuration lives in Supabase.
- No production guild IDs, role IDs, channel IDs or category IDs are hard-coded.
- The DEV guild is selected with `DEV_GUILD_ID`.
- Features are implemented as isolated modules.
- The backend uses the Supabase service-role key; it must never be exposed to browser or client-side code.

## Environment variables

Required:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DEV_GUILD_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional creator integrations:

- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `KICK_CLIENT_ID`
- `KICK_CLIENT_SECRET`

Keep optional provider credentials paired. If a provider is not configured, its creator polling remains inactive.

## Database

The active Supabase project is configured through `SUPABASE_URL`. Apply the SQL migrations in `supabase/migrations` in order before starting the bot in a new environment.

The bot uses the Supabase service role from the backend. Direct application-table access for `public`, `anon` and `authenticated` roles is revoked by the final security migration.

## Development

1. Copy `.env.example` to `.env`.
2. Fill the required environment variables.
3. Install dependencies with `npm install`.
4. Run `npm run check`.
5. Run `npm run build`.
6. Run `npm run dev`.

## Production

Use Node.js 22 or newer.

Set all required environment variables in the host's secret/environment-variable manager. Do not commit `.env` or service-role credentials.

The production start command is:

```bash
npm run build
npm start
```

The process should be configured to restart after an unexpected exit. On SIGINT/SIGTERM the bot destroys its Discord client and exits cleanly so the host can restart it when required.

## CI

GitHub Actions runs on pushes and pull requests targeting `main` and executes:

```bash
npm install
npm run check
npm run build
```

## Current modules

- Core
- Tickets
- Moderation
- Logs
- AutoMod / Anti-raid
- Creators
- Community
- Statistics

All modules are designed for multi-guild operation with isolated configuration by `guild_id`.

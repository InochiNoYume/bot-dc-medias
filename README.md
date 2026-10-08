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

## Development

1. Copy `.env.example` to `.env`.
2. Fill the environment variables.
3. Install dependencies with `npm install`.
4. Run `npm run check`.
5. Run `npm run dev`.

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

# Bot DC Medias

Multi-guild Discord bot for creator communities and development environments.

## Stack

- Node.js 20+
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

The initial phase only boots the core and database connection. Feature modules are added incrementally and tested in the DEV guild first.

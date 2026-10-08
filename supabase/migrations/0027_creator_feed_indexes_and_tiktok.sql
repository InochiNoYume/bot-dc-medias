-- Creator feed hardening.
-- The application supports TikTok feeds, so keep the database constraint aligned
-- with the supported platform set.
alter table public.creator_feeds
  drop constraint if exists creator_feeds_platform_check;

alter table public.creator_feeds
  add constraint creator_feeds_platform_check
  check (platform in ('youtube', 'twitch', 'kick', 'tiktok'));

-- Polling is always scoped to a guild and then filtered by enabled/due state.
create index if not exists idx_creator_feeds_guild_poll_due
  on public.creator_feeds(guild_id, enabled, last_checked_at);

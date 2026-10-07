alter table public.creator_feeds drop constraint if exists creator_feeds_platform_check;

alter table public.creator_feeds
  add constraint creator_feeds_platform_check
  check (platform in ('youtube', 'twitch', 'kick', 'tiktok'));

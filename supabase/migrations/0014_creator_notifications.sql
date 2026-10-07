create table if not exists public.creator_feeds (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null references public.guilds(guild_id) on delete cascade,
  platform text not null check (platform in ('youtube','twitch','kick')),
  external_id text not null,
  display_name text not null,
  channel_id text not null,
  mention_role_id text,
  enabled boolean not null default true,
  last_external_item_id text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(guild_id, platform, external_id)
);

create index if not exists idx_creator_feeds_guild_enabled on public.creator_feeds(guild_id, enabled);

alter table public.creator_feeds enable row level security;
revoke all on table public.creator_feeds from anon, authenticated;

drop trigger if exists creator_feeds_updated_at on public.creator_feeds;
create trigger creator_feeds_updated_at
before update on public.creator_feeds
for each row execute function public.set_updated_at();

create table if not exists public.creator_notifications (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.creator_feeds(id) on delete cascade,
  external_item_id text not null,
  title text not null,
  url text not null,
  published_at timestamptz,
  sent_at timestamptz not null default now(),
  unique(feed_id, external_item_id)
);

create index if not exists idx_creator_notifications_feed on public.creator_notifications(feed_id);

alter table public.creator_notifications enable row level security;
revoke all on table public.creator_notifications from anon, authenticated;
create table if not exists public.guild_automod_configs (
  guild_id text primary key references public.guilds(guild_id) on delete cascade,
  enabled boolean not null default false,
  bad_words text[] not null default '{}'::text[],
  blocked_patterns text[] not null default '{}'::text[],
  max_mentions integer not null default 5 check (max_mentions between 1 and 50),
  max_messages integer not null default 6 check (max_messages between 2 and 30),
  message_window_seconds integer not null default 8 check (message_window_seconds between 2 and 60),
  action text not null default 'delete' check (action in ('delete','timeout')),
  timeout_seconds integer not null default 60 check (timeout_seconds between 10 and 86400),
  raid_enabled boolean not null default true,
  raid_join_threshold integer not null default 8 check (raid_join_threshold between 3 and 50),
  raid_window_seconds integer not null default 15 check (raid_window_seconds between 5 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_guild_automod_enabled on public.guild_automod_configs(enabled);
alter table public.guild_automod_configs enable row level security;
revoke all on table public.guild_automod_configs from anon, authenticated;
drop trigger if exists guild_automod_configs_updated_at on public.guild_automod_configs;
create trigger guild_automod_configs_updated_at before update on public.guild_automod_configs
for each row execute function public.set_updated_at();
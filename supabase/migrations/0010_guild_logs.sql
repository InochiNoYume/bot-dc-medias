create table if not exists public.guild_log_configs (
  guild_id text primary key references public.guilds(guild_id) on delete cascade,
  channel_id text,
  enabled_events text[] not null default array[
    'member_join',
    'member_leave',
    'message_delete',
    'message_update',
    'channel_create',
    'channel_delete',
    'channel_update',
    'role_create',
    'role_delete',
    'role_update',
    'ban_add',
    'ban_remove'
  ]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_guild_log_configs_channel
  on public.guild_log_configs(channel_id);

alter table public.guild_log_configs enable row level security;

drop trigger if exists guild_log_configs_updated_at on public.guild_log_configs;
create trigger guild_log_configs_updated_at
before update on public.guild_log_configs
for each row execute function public.set_updated_at();

revoke all on table public.guild_log_configs from anon, authenticated;

alter table public.guild_automod_configs
  add column if not exists trusted_role_ids text[] not null default '{}',
  add column if not exists raid_active_until timestamptz,
  add column if not exists raid_started_at timestamptz,
  add column if not exists raid_join_count integer not null default 0 check (raid_join_count >= 0);

create index if not exists idx_guild_automod_raid_active
  on public.guild_automod_configs(raid_active_until)
  where raid_active_until is not null;

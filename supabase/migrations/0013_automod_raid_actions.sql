alter table public.guild_automod_configs
  add column if not exists raid_action text not null default 'alert' check (raid_action in ('alert','timeout','kick')),
  add column if not exists raid_timeout_seconds integer not null default 600 check (raid_timeout_seconds between 10 and 86400),
  add column if not exists raid_quarantine_role_id text,
  add column if not exists raid_lockdown boolean not null default false;

create index if not exists idx_guild_automod_quarantine_role
  on public.guild_automod_configs(raid_quarantine_role_id);
create table if not exists public.moderation_channel_locks (
  guild_id text not null references public.guilds(guild_id) on delete cascade,
  channel_id text primary key,
  locked_by text not null,
  previous_send_messages boolean,
  reason text not null default 'Moderación de canal.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_moderation_channel_locks_guild
  on public.moderation_channel_locks(guild_id);

alter table public.moderation_channel_locks enable row level security;

revoke all on public.moderation_channel_locks from public, anon, authenticated;

drop trigger if exists set_moderation_channel_locks_updated_at
  on public.moderation_channel_locks;

create trigger set_moderation_channel_locks_updated_at
before update on public.moderation_channel_locks
for each row execute function public.set_updated_at();

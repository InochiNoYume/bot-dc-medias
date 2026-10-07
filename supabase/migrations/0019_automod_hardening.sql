alter table public.guild_automod_configs
  add column if not exists trusted_role_ids text[] not null default '{}',
  add column if not exists raid_active_until timestamptz,
  add column if not exists raid_started_at timestamptz,
  add column if not exists raid_join_count integer not null default 0 check (raid_join_count >= 0);

create index if not exists idx_guild_automod_raid_active
  on public.guild_automod_configs(raid_active_until)
  where raid_active_until is not null;

create table if not exists public.automod_lockdown_channels (
  guild_id text not null references public.guilds(guild_id) on delete cascade,
  channel_id text primary key,
  previous_send_messages boolean,
  locked_at timestamptz not null default now()
);

create index if not exists idx_automod_lockdown_guild
  on public.automod_lockdown_channels(guild_id);

alter table public.automod_lockdown_channels enable row level security;
revoke all on public.automod_lockdown_channels from public, anon, authenticated;

create or replace function public.register_automod_raid_join(
  p_guild_id text,
  p_threshold integer,
  p_window_seconds integer
)
returns table (
  triggered boolean,
  active boolean,
  join_count integer,
  active_until timestamptz,
  started_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_started timestamptz;
  v_count integer;
  v_until timestamptz;
begin
  update public.guild_automod_configs
  set
    raid_join_count = case
      when raid_started_at is null
        or v_now > raid_started_at + make_interval(secs => p_window_seconds)
      then 1
      else raid_join_count + 1
    end,
    raid_started_at = case
      when raid_started_at is null
        or v_now > raid_started_at + make_interval(secs => p_window_seconds)
      then v_now
      else raid_started_at
    end,
    updated_at = v_now
  where guild_id = p_guild_id
  returning raid_started_at, raid_join_count, raid_active_until
  into v_started, v_count, v_until;

  if not found then
    raise exception 'guild_automod_config not found for guild %', p_guild_id;
  end if;

  if v_until is not null and v_until > v_now then
    return query select true, true, v_count, v_until, v_started;
    return;
  end if;

  if v_count >= p_threshold then
    v_until := v_now + make_interval(secs => p_window_seconds);
    update public.guild_automod_configs
    set raid_active_until = v_until, updated_at = v_now
    where guild_id = p_guild_id;

    return query select true, true, v_count, v_until, v_started;
  end if;

  return query select false, false, v_count, null::timestamptz, v_started;
end;
$$;

revoke all on function public.register_automod_raid_join(text, integer, integer) from public, anon, authenticated;
grant execute on function public.register_automod_raid_join(text, integer, integer) to service_role;

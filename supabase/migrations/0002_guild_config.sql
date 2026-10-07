create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists guilds_set_updated_at on public.guilds;
create trigger guilds_set_updated_at
before update on public.guilds
for each row execute function public.set_updated_at();

drop trigger if exists guild_settings_set_updated_at on public.guild_settings;
create trigger guild_settings_set_updated_at
before update on public.guild_settings
for each row execute function public.set_updated_at();

create index if not exists idx_guilds_updated_at
  on public.guilds(updated_at);
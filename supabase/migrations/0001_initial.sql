create table if not exists public.guilds (
  guild_id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guild_settings (
  guild_id text primary key references public.guilds(guild_id) on delete cascade,
  locale text not null default 'es-ES',
  timezone text not null default 'UTC',
  setup_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_guild_settings_setup_completed
  on public.guild_settings(setup_completed);

alter table public.guilds enable row level security;
alter table public.guild_settings enable row level security;

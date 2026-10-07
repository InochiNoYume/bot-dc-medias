create table if not exists public.ticket_panels (
  id uuid primary key default gen_random_uuid(), guild_id text not null references public.guilds(guild_id) on delete cascade,
  channel_id text not null, message_id text not null unique, title text not null default 'Soporte',
  description text not null default 'Selecciona una categoría para abrir un ticket.', enabled boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (guild_id, channel_id)
);
create table if not exists public.ticket_members (
  ticket_id uuid not null references public.tickets(id) on delete cascade, user_id text not null,
  added_at timestamptz not null default now(), primary key (ticket_id, user_id)
);
create table if not exists public.ticket_ratings (
  id uuid primary key default gen_random_uuid(), ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  guild_id text not null references public.guilds(guild_id) on delete cascade, user_id text not null,
  rating integer not null check (rating between 1 and 5), comment text, created_at timestamptz not null default now()
);
create table if not exists public.ticket_transcripts (
  id uuid primary key default gen_random_uuid(), ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  guild_id text not null references public.guilds(guild_id) on delete cascade, storage_key text, content text,
  created_at timestamptz not null default now()
);
create table if not exists public.guild_ticket_counters (
  guild_id text primary key references public.guilds(guild_id) on delete cascade,
  next_number bigint not null default 1 check (next_number > 0)
);
alter table public.tickets add column if not exists display_number bigint;
update public.tickets set display_number = ticket_number where display_number is null;
create index if not exists idx_ticket_panels_guild on public.ticket_panels(guild_id);
create index if not exists idx_ticket_members_user on public.ticket_members(user_id);
create index if not exists idx_ticket_ratings_guild on public.ticket_ratings(guild_id);
create index if not exists idx_tickets_guild_display_number on public.tickets(guild_id, display_number);
create unique index if not exists uq_tickets_guild_display_number on public.tickets(guild_id, display_number) where display_number is not null;
alter table public.ticket_panels enable row level security;
alter table public.ticket_members enable row level security;
alter table public.ticket_ratings enable row level security;
alter table public.ticket_transcripts enable row level security;
drop trigger if exists ticket_panels_set_updated_at on public.ticket_panels;
create trigger ticket_panels_set_updated_at before update on public.ticket_panels for each row execute function public.set_updated_at();

create or replace function public.next_ticket_number(p_guild_id text)
returns bigint language plpgsql security definer set search_path = public as $$
declare next_number bigint;
begin
  insert into public.guild_ticket_counters (guild_id, next_number) values (p_guild_id, 2)
  on conflict (guild_id) do update set next_number = public.guild_ticket_counters.next_number + 1
  returning public.guild_ticket_counters.next_number - 1 into next_number;
  return next_number;
end;
$$;

-- Ticket administration extensions
alter table public.tickets add column if not exists closed_by text;
alter table public.tickets add column if not exists close_reason text;
alter table public.tickets add column if not exists archived_at timestamptz;

create index if not exists idx_tickets_guild_status on public.tickets(guild_id, status);
create index if not exists idx_tickets_claimed_by on public.tickets(claimed_by);

create table if not exists public.ticket_logs (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null references public.guilds(guild_id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  actor_id text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ticket_logs_ticket on public.ticket_logs(ticket_id, created_at desc);
create index if not exists idx_ticket_logs_guild on public.ticket_logs(guild_id, created_at desc);
alter table public.ticket_logs enable row level security;

create or replace function public.log_ticket_action(
  p_guild_id text,
  p_ticket_id uuid,
  p_actor_id text,
  p_action text,
  p_details jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.ticket_logs(guild_id, ticket_id, actor_id, action, details)
  values (p_guild_id, p_ticket_id, p_actor_id, p_action, coalesce(p_details, '{}'::jsonb));
end;
$$;

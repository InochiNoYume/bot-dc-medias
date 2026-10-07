-- Ticket activity tracking for automatic inactivity closure
alter table public.tickets add column if not exists last_activity_at timestamptz not null default now();
create index if not exists idx_tickets_activity on public.tickets(status, last_activity_at);

update public.tickets
set last_activity_at = coalesce(last_activity_at, created_at)
where last_activity_at is null;

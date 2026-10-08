-- Performance indexes for background workers.
--
-- Ticket auto-close scans active tickets by inactivity and then joins their
-- category configuration. Keep the scan selective as ticket volume grows.
create index if not exists idx_tickets_active_inactivity
  on public.tickets(status, last_activity_at)
  where status in ('open', 'claimed');

create index if not exists idx_ticket_categories_autoclose
  on public.ticket_categories(guild_id, id)
  where auto_close_minutes is not null and enabled = true;

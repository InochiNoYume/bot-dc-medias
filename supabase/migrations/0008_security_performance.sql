-- Security and performance hardening.

create index if not exists idx_tickets_category on public.tickets(category_id);
create index if not exists idx_ticket_transcripts_guild on public.ticket_transcripts(guild_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.log_ticket_action(text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.next_ticket_number(text) from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

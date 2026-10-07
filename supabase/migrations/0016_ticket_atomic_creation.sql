create or replace function public.create_ticket_if_available(
  p_guild_id text,
  p_channel_id text,
  p_owner_id text,
  p_category_id uuid,
  p_priority text
)
returns public.tickets
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_max_open integer;
  v_open_count integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id || ':' || p_owner_id || ':' || p_category_id::text, 0)
  );

  select max_open_per_user
    into v_max_open
  from public.ticket_categories
  where guild_id = p_guild_id
    and id = p_category_id
    and enabled = true;

  if v_max_open is null then
    raise exception 'TICKET_CATEGORY_NOT_FOUND';
  end if;

  select count(*)::integer
    into v_open_count
  from public.tickets
  where guild_id = p_guild_id
    and owner_id = p_owner_id
    and category_id = p_category_id
    and status in ('open', 'claimed');

  if v_open_count >= v_max_open then
    raise exception 'TICKET_LIMIT_REACHED';
  end if;

  insert into public.tickets (
    guild_id, channel_id, owner_id, category_id, priority, display_number
  )
  values (
    p_guild_id,
    p_channel_id,
    p_owner_id,
    p_category_id,
    p_priority,
    public.next_ticket_number(p_guild_id)
  )
  returning * into v_ticket;

  return v_ticket;
end;
$$;

revoke execute on function public.create_ticket_if_available(text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_ticket_if_available(text, text, text, uuid, text) to service_role;

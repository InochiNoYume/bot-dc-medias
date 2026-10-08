-- Ticket categories must point to a real Discord category and at least one staff role.
-- Existing incomplete records are disabled so stale panel buttons cannot create tickets.
update public.ticket_categories
set enabled = false
where enabled = true
  and (
    discord_category_id is null
    or coalesce(array_length(staff_role_ids, 1), 0) = 0
  );

create index if not exists idx_ticket_categories_enabled_config
  on public.ticket_categories(guild_id, enabled, discord_category_id)
  where enabled = true and discord_category_id is not null;

alter table public.guild_settings
  add column if not exists ticket_archive_category_id text;

create index if not exists idx_guild_settings_ticket_archive
  on public.guild_settings(ticket_archive_category_id);

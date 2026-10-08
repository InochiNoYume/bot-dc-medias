-- Final database access hardening.
--
-- The bot uses the Supabase service role exclusively from the backend.
-- Application tables must not be directly readable or writable by
-- public/anon/authenticated roles.
revoke all on table
  public.guilds,
  public.guild_settings,
  public.ticket_categories,
  public.tickets,
  public.ticket_panels,
  public.ticket_members,
  public.ticket_ratings,
  public.ticket_transcripts,
  public.guild_ticket_counters,
  public.ticket_logs,
  public.guild_log_configs,
  public.moderation_cases,
  public.moderation_notes,
  public.moderation_channel_locks,
  public.guild_automod_configs,
  public.automod_lockdown_channels,
  public.creator_feeds,
  public.creator_notifications,
  public.community_suggestions,
  public.community_suggestion_votes
from public, anon, authenticated;

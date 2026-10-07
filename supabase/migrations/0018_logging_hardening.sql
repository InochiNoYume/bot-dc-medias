alter table public.guild_log_configs
  alter column enabled_events set default array[
    'member_join',
    'member_leave',
    'member_update',
    'message_delete',
    'message_bulk_delete',
    'message_update',
    'channel_create',
    'channel_delete',
    'channel_update',
    'role_create',
    'role_delete',
    'role_update',
    'ban_add',
    'ban_remove',
    'guild_update',
    'thread_create',
    'thread_delete',
    'thread_update',
    'invite_create',
    'invite_delete',
    'webhook_update',
    'moderation_action',
    'ticket_action',
    'ticket_rating'
  ]::text[];

update public.guild_log_configs
set enabled_events = array(
  select distinct event
  from unnest(
    enabled_events || array[
      'member_update',
      'message_bulk_delete',
      'guild_update',
      'thread_create',
      'thread_delete',
      'thread_update',
      'invite_create',
      'invite_delete',
      'webhook_update'
    ]::text[]
  ) as event
);
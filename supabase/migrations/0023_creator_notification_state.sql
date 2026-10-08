-- Creator notification state hardening.
-- Claims must not be considered sent until Discord delivery succeeds.
alter table public.creator_notifications
  alter column sent_at drop not null;

create index if not exists idx_creator_notifications_unsent
  on public.creator_notifications(feed_id, external_item_id)
  where sent_at is null;

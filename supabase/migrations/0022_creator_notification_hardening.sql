alter table public.creator_feeds
  add column if not exists poll_interval_seconds integer not null default 120
    check (poll_interval_seconds between 60 and 3600);

create index if not exists idx_creator_feeds_poll_due
  on public.creator_feeds(enabled, last_checked_at);

alter table public.creator_notifications
  add column if not exists claimed_at timestamptz;

create index if not exists idx_creator_notifications_claimed_at
  on public.creator_notifications(claimed_at);

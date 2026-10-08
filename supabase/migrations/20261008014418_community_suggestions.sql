create table public.community_suggestions (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  author_id text not null,
  title text not null,
  description text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','implemented')),
  upvotes integer not null default 0 check (upvotes >= 0),
  downvotes integer not null default 0 check (downvotes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_suggestion_votes (
  suggestion_id uuid not null references public.community_suggestions(id) on delete cascade,
  guild_id text not null,
  user_id text not null,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (suggestion_id, user_id)
);

create index community_suggestions_guild_status_idx
  on public.community_suggestions (guild_id, status, created_at desc);

create index community_suggestion_votes_guild_user_idx
  on public.community_suggestion_votes (guild_id, user_id);

alter table public.community_suggestions enable row level security;
alter table public.community_suggestion_votes enable row level security;

revoke all on table public.community_suggestions, public.community_suggestion_votes from anon, authenticated;
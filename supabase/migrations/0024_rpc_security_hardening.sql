-- Final RPC security and concurrency hardening.
--
-- Ticket logs must never accept a ticket/guild combination that does not
-- belong together, even though the function runs as SECURITY DEFINER.
create or replace function public.log_ticket_action(
  p_guild_id text,
  p_ticket_id uuid,
  p_actor_id text,
  p_action text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.tickets
    where id = p_ticket_id
      and guild_id = p_guild_id
  ) then
    raise exception 'TICKET_NOT_FOUND';
  end if;

  insert into public.ticket_logs(guild_id, ticket_id, actor_id, action, details)
  values (
    p_guild_id,
    p_ticket_id,
    p_actor_id,
    p_action,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.log_ticket_action(text, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.log_ticket_action(text, uuid, text, text, jsonb)
  to service_role;

-- Serialize votes on the suggestion row so concurrent votes cannot lose
-- counter increments or produce inconsistent totals.
create or replace function public.vote_community_suggestion(
  p_guild_id text,
  p_suggestion_id uuid,
  p_user_id text,
  p_vote smallint
)
returns table (
  suggestion_id uuid,
  upvotes integer,
  downvotes integer,
  user_vote smallint
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  old_vote smallint;
begin
  if p_vote not in (-1, 1) then
    raise exception 'INVALID_VOTE';
  end if;

  if not exists (
    select 1
    from public.community_suggestions
    where id = p_suggestion_id
      and guild_id = p_guild_id
  ) then
    raise exception 'SUGGESTION_NOT_FOUND';
  end if;

  -- Lock the parent suggestion before reading/updating its counters.
  perform 1
  from public.community_suggestions
  where id = p_suggestion_id
    and guild_id = p_guild_id
  for update;

  select v.vote
    into old_vote
  from public.community_suggestion_votes v
  where v.suggestion_id = p_suggestion_id
    and v.user_id = p_user_id
  for update;

  if old_vote is null then
    insert into public.community_suggestion_votes (
      suggestion_id,
      guild_id,
      user_id,
      vote
    )
    values (
      p_suggestion_id,
      p_guild_id,
      p_user_id,
      p_vote
    );

    update public.community_suggestions
    set
      upvotes = upvotes + case when p_vote = 1 then 1 else 0 end,
      downvotes = downvotes + case when p_vote = -1 then 1 else 0 end,
      updated_at = now()
    where id = p_suggestion_id
      and guild_id = p_guild_id;

  elsif old_vote = p_vote then
    delete from public.community_suggestion_votes
    where suggestion_id = p_suggestion_id
      and user_id = p_user_id;

    update public.community_suggestions
    set
      upvotes = upvotes - case when p_vote = 1 then 1 else 0 end,
      downvotes = downvotes - case when p_vote = -1 then 1 else 0 end,
      updated_at = now()
    where id = p_suggestion_id
      and guild_id = p_guild_id;

  else
    update public.community_suggestion_votes
    set
      vote = p_vote,
      updated_at = now()
    where suggestion_id = p_suggestion_id
      and user_id = p_user_id;

    update public.community_suggestions
    set
      upvotes = upvotes + case when p_vote = 1 then 1 else -1 end,
      downvotes = downvotes + case when p_vote = -1 then 1 else -1 end,
      updated_at = now()
    where id = p_suggestion_id
      and guild_id = p_guild_id;
  end if;

  return query
  select
    s.id,
    s.upvotes,
    s.downvotes,
    v.vote
  from public.community_suggestions s
  left join public.community_suggestion_votes v
    on v.suggestion_id = s.id
    and v.user_id = p_user_id
  where s.id = p_suggestion_id
    and s.guild_id = p_guild_id;
end;
$$;

revoke execute on function public.vote_community_suggestion(text, uuid, text, smallint)
  from public, anon, authenticated;
grant execute on function public.vote_community_suggestion(text, uuid, text, smallint)
  to service_role;

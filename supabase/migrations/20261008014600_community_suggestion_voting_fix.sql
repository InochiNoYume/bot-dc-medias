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
set search_path = public
as $$
declare
  old_vote smallint;
begin
  if p_vote not in (-1, 1) then
    raise exception 'INVALID_VOTE';
  end if;

  if not exists (
    select 1 from public.community_suggestions s
    where s.id = p_suggestion_id and s.guild_id = p_guild_id
  ) then
    raise exception 'SUGGESTION_NOT_FOUND';
  end if;

  select v.vote into old_vote
  from public.community_suggestion_votes v
  where v.suggestion_id = p_suggestion_id and v.user_id = p_user_id
  for update;

  if old_vote is null then
    insert into public.community_suggestion_votes (suggestion_id, guild_id, user_id, vote)
    values (p_suggestion_id, p_guild_id, p_user_id, p_vote);
    update public.community_suggestions s
      set upvotes = s.upvotes + case when p_vote = 1 then 1 else 0 end,
          downvotes = s.downvotes + case when p_vote = -1 then 1 else 0 end,
          updated_at = now()
      where s.id = p_suggestion_id and s.guild_id = p_guild_id;
  elsif old_vote = p_vote then
    delete from public.community_suggestion_votes v
      where v.suggestion_id = p_suggestion_id and v.user_id = p_user_id;
    update public.community_suggestions s
      set upvotes = s.upvotes - case when p_vote = 1 then 1 else 0 end,
          downvotes = s.downvotes - case when p_vote = -1 then 1 else 0 end,
          updated_at = now()
      where s.id = p_suggestion_id and s.guild_id = p_guild_id;
  else
    update public.community_suggestion_votes v
      set vote = p_vote, updated_at = now()
      where v.suggestion_id = p_suggestion_id and v.user_id = p_user_id;
    update public.community_suggestions s
      set upvotes = s.upvotes + case when p_vote = 1 then 1 else -1 end,
          downvotes = s.downvotes + case when p_vote = -1 then 1 else -1 end,
          updated_at = now()
      where s.id = p_suggestion_id and s.guild_id = p_guild_id;
  end if;

  return query
  select s.id, s.upvotes, s.downvotes, v.vote
  from public.community_suggestions s
  left join public.community_suggestion_votes v
    on v.suggestion_id = s.id and v.user_id = p_user_id
  where s.id = p_suggestion_id and s.guild_id = p_guild_id;
end;
$$;
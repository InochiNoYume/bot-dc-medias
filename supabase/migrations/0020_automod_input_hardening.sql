create or replace function public.automod_array_items_max_length(p_values text[], p_max_length integer)
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(length(value) <= p_max_length), true)
  from unnest(p_values) as value;
$$;

revoke all on function public.automod_array_items_max_length(text[], integer) from public, anon, authenticated;
grant execute on function public.automod_array_items_max_length(text[], integer) to service_role;

alter table public.guild_automod_configs
  add constraint guild_automod_bad_words_count_check
    check (cardinality(bad_words) <= 100),
  add constraint guild_automod_bad_words_length_check
    check (public.automod_array_items_max_length(bad_words, 100)),
  add constraint guild_automod_blocked_patterns_count_check
    check (cardinality(blocked_patterns) <= 100),
  add constraint guild_automod_blocked_patterns_length_check
    check (public.automod_array_items_max_length(blocked_patterns, 200)),
  add constraint guild_automod_trusted_roles_count_check
    check (cardinality(trusted_role_ids) <= 25);

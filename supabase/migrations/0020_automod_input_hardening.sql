alter table public.guild_automod_configs
  add constraint guild_automod_bad_words_count_check
    check (cardinality(bad_words) <= 100),
  add constraint guild_automod_bad_words_length_check
    check (not exists (select 1 from unnest(bad_words) as value where length(value) > 100)),
  add constraint guild_automod_blocked_patterns_count_check
    check (cardinality(blocked_patterns) <= 100),
  add constraint guild_automod_blocked_patterns_length_check
    check (not exists (select 1 from unnest(blocked_patterns) as value where length(value) > 200)),
  add constraint guild_automod_trusted_roles_count_check
    check (cardinality(trusted_role_ids) <= 25);

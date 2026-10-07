import { supabase } from "../../database/supabase.js";

export type CreatorPlatform = "youtube" | "twitch" | "kick";

export interface CreatorFeed {
  id: string;
  guild_id: string;
  platform: CreatorPlatform;
  external_id: string;
  display_name: string;
  channel_id: string;
  mention_role_id: string | null;
  enabled: boolean;
  last_external_item_id: string | null;
  last_checked_at: string | null;
}

export async function listCreatorFeeds(guildId: string): Promise<CreatorFeed[]> {
  const { data, error } = await supabase.from("creator_feeds").select("*").eq("guild_id", guildId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CreatorFeed[];
}

export async function getCreatorFeed(guildId: string, platform: CreatorPlatform, externalId: string): Promise<CreatorFeed | null> {
  const { data, error } = await supabase.from("creator_feeds").select("*").eq("guild_id", guildId).eq("platform", platform).eq("external_id", externalId).maybeSingle();
  if (error) throw error;
  return (data as CreatorFeed | null) ?? null;
}

export async function createCreatorFeed(input: {
  guildId: string;
  platform: CreatorPlatform;
  externalId: string;
  displayName: string;
  channelId: string;
  mentionRoleId?: string | null;
}): Promise<CreatorFeed> {
  const { data, error } = await supabase.from("creator_feeds").insert({
    guild_id: input.guildId,
    platform: input.platform,
    external_id: input.externalId,
    display_name: input.displayName,
    channel_id: input.channelId,
    mention_role_id: input.mentionRoleId ?? null,
  }).select("*").single();
  if (error) throw error;
  return data as CreatorFeed;
}

export async function deleteCreatorFeed(guildId: string, id: string): Promise<void> {
  const { error } = await supabase.from("creator_feeds").delete().eq("guild_id", guildId).eq("id", id);
  if (error) throw error;
}

export async function updateCreatorFeed(id: string, patch: Partial<Pick<CreatorFeed, "channel_id" | "mention_role_id" | "enabled" | "last_external_item_id" | "last_checked_at">>): Promise<void> {
  const { error } = await supabase.from("creator_feeds").update(patch).eq("id", id);
  if (error) throw error;
}

export async function wasCreatorNotificationSent(feedId: string, externalItemId: string): Promise<boolean> {
  const { data, error } = await supabase.from("creator_notifications").select("id").eq("feed_id", feedId).eq("external_item_id", externalItemId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function markCreatorNotificationSent(input: { feedId: string; externalItemId: string; title: string; url: string; publishedAt: string | null }): Promise<void> {
  const { error } = await supabase.from("creator_notifications").insert({
    feed_id: input.feedId,
    external_item_id: input.externalItemId,
    title: input.title,
    url: input.url,
    published_at: input.publishedAt,
  });
  if (error && error.code !== "23505") throw error;
}
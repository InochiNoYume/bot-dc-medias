import { supabase } from "../../database/supabase.js";

export type CreatorPlatform = "youtube" | "twitch" | "kick" | "tiktok";

export interface CreatorFeed {
  id: string;
  guild_id: string;
  platform: CreatorPlatform;
  external_id: string;
  display_name: string;
  channel_id: string;
  mention_role_id: string | null;
  enabled: boolean;
  poll_interval_seconds: number;
  last_external_item_id: string | null;
  last_checked_at: string | null;
}

export async function listCreatorFeeds(guildId: string): Promise<CreatorFeed[]> {
  const { data, error } = await supabase
    .from("creator_feeds")
    .select("*")
    .eq("guild_id", guildId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CreatorFeed[];
}

export async function getCreatorFeed(guildId: string, platform: CreatorPlatform, externalId: string): Promise<CreatorFeed | null> {
  const { data, error } = await supabase
    .from("creator_feeds")
    .select("*")
    .eq("guild_id", guildId)
    .eq("platform", platform)
    .eq("external_id", externalId)
    .maybeSingle();
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
  const { data, error } = await supabase
    .from("creator_feeds")
    .insert({
      guild_id: input.guildId,
      platform: input.platform,
      external_id: input.externalId,
      display_name: input.displayName,
      channel_id: input.channelId,
      mention_role_id: input.mentionRoleId ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as CreatorFeed;
}

export async function deleteCreatorFeed(guildId: string, id: string): Promise<void> {
  const { error } = await supabase.from("creator_feeds").delete().eq("guild_id", guildId).eq("id", id);
  if (error) throw error;
}

export async function updateCreatorFeed(
  guildId: string,
  id: string,
  patch: Partial<Pick<CreatorFeed, "channel_id" | "mention_role_id" | "enabled" | "poll_interval_seconds" | "last_external_item_id" | "last_checked_at">>,
): Promise<void> {
  const { error } = await supabase.from("creator_feeds").update(patch).eq("guild_id", guildId).eq("id", id);
  if (error) throw error;
}

export type CreatorNotificationClaimResult =
  | { status: "claimed"; claimedAt: string }
  | { status: "already_sent" }
  | { status: "in_progress" };

const CREATOR_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

export async function claimCreatorNotification(input: {
  feedId: string;
  externalItemId: string;
  title: string;
  url: string;
  publishedAt: string | null;
}): Promise<CreatorNotificationClaimResult> {
  const claimedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("creator_notifications")
    .insert({
      feed_id: input.feedId,
      external_item_id: input.externalItemId,
      title: input.title,
      url: input.url,
      published_at: input.publishedAt,
      claimed_at: claimedAt,
      sent_at: null,
    })
    .select("id")
    .maybeSingle();

  if (!error) return data ? { status: "claimed", claimedAt } : { status: "in_progress" };
  if (error.code !== "23505") throw error;

  const existing = await supabase
    .from("creator_notifications")
    .select("sent_at, claimed_at")
    .eq("feed_id", input.feedId)
    .eq("external_item_id", input.externalItemId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) return { status: "in_progress" };
  if (existing.data.sent_at) return { status: "already_sent" };

  const existingClaimedAt = existing.data.claimed_at ? Date.parse(existing.data.claimed_at) : 0;
  if (existingClaimedAt && Date.now() - existingClaimedAt < CREATOR_CLAIM_TIMEOUT_MS) {
    return { status: "in_progress" };
  }

  const { error: releaseError } = await supabase
    .from("creator_notifications")
    .delete()
    .eq("feed_id", input.feedId)
    .eq("external_item_id", input.externalItemId)
    .eq("claimed_at", existing.data.claimed_at)
    .is("sent_at", null);
  if (releaseError) throw releaseError;

  const retry = await supabase
    .from("creator_notifications")
    .insert({
      feed_id: input.feedId,
      external_item_id: input.externalItemId,
      title: input.title,
      url: input.url,
      published_at: input.publishedAt,
      claimed_at: claimedAt,
      sent_at: null,
    })
    .select("id")
    .maybeSingle();
  if (retry.error?.code === "23505") return { status: "in_progress" };
  if (retry.error) throw retry.error;
  return retry.data ? { status: "claimed", claimedAt } : { status: "in_progress" };
}

export async function releaseCreatorNotificationClaim(
  feedId: string,
  externalItemId: string,
  claimedAt: string,
): Promise<void> {
  const { error } = await supabase
    .from("creator_notifications")
    .delete()
    .eq("feed_id", feedId)
    .eq("external_item_id", externalItemId)
    .eq("claimed_at", claimedAt)
    .is("sent_at", null);
  if (error) throw error;
}

export async function markCreatorNotificationSent(input: {
  feedId: string;
  externalItemId: string;
  title: string;
  url: string;
  publishedAt: string | null;
  claimedAt: string;
}): Promise<boolean> {
  const { data, error } = await supabase
    .from("creator_notifications")
    .update({
      title: input.title,
      url: input.url,
      published_at: input.publishedAt,
      sent_at: new Date().toISOString(),
    })
    .eq("feed_id", input.feedId)
    .eq("external_item_id", input.externalItemId)
    .eq("claimed_at", input.claimedAt)
    .is("sent_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

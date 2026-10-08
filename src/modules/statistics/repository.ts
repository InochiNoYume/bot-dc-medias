import { supabase } from "../../database/supabase.js";

const PAGE_SIZE = 1000;

export interface TicketStatsRow {
  status: "open" | "claimed" | "closed";
  owner_id: string;
  category_id: string;
  priority: "low" | "normal" | "high" | "urgent";
  claimed_by: string | null;
  closed_by: string | null;
  created_at: string;
  claimed_at: string | null;
  closed_at: string | null;
}

export interface ModerationStatsRow {
  moderator_id: string;
  action: string;
  status: string;
}

export interface RatingStatsRow {
  rating: number;
}

export interface SuggestionStatsRow {
  status: "pending" | "approved" | "rejected" | "implemented";
  upvotes: number;
  downvotes: number;
}

export interface CategoryRow {
  id: string;
  name: string;
}

async function fetchAll<T>(
  table: string,
  columns: string,
  guildId: string,
  orderColumn = "created_at",
): Promise<T[]> {
  const rows: T[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("guild_id", guildId)
      .order(orderColumn, { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function getTickets(guildId: string): Promise<TicketStatsRow[]> {
  return fetchAll<TicketStatsRow>(
    "tickets",
    "status,owner_id,category_id,priority,claimed_by,closed_by,created_at,claimed_at,closed_at",
    guildId,
  );
}

export async function getModerationCases(guildId: string): Promise<ModerationStatsRow[]> {
  return fetchAll<ModerationStatsRow>("moderation_cases", "moderator_id,action,status", guildId);
}

export async function getRatings(guildId: string): Promise<RatingStatsRow[]> {
  return fetchAll<RatingStatsRow>("ticket_ratings", "rating", guildId);
}

export async function getSuggestions(guildId: string): Promise<SuggestionStatsRow[]> {
  return fetchAll<SuggestionStatsRow>("community_suggestions", "status,upvotes,downvotes", guildId);
}

export async function getTicketCategories(guildId: string): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from("ticket_categories")
    .select("id,name")
    .eq("guild_id", guildId);
  if (error) throw error;
  return (data ?? []) as CategoryRow[];
}

export async function countRows(table: string, guildId: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("guild_id", guildId);
  if (error) throw error;
  return count ?? 0;
}

export async function getCreatorStats(guildId: string) {
  const [feeds, notifications] = await Promise.all([
    countRows("creator_feeds", guildId),
    getCreatorNotificationCount(guildId),
  ]);

  return { feeds, notifications };
}

async function getCreatorNotificationCount(guildId: string): Promise<number> {
  const { count, error } = await supabase
    .from("creator_notifications")
    .select("id,creator_feeds!inner(guild_id)", { count: "exact", head: true })
    .eq("creator_feeds.guild_id", guildId);
  if (error) throw error;
  return count ?? 0;
}

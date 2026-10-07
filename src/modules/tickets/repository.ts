import { supabase } from "../../database/supabase.js";
import type { TicketCategory, TicketRecord } from "./types.js";

export async function listTicketCategories(guildId: string): Promise<TicketCategory[]> {
  const { data, error } = await supabase
    .from("ticket_categories")
    .select("*")
    .eq("guild_id", guildId)
    .eq("enabled", true)
    .order("name");

  if (error) throw error;
  return (data ?? []) as TicketCategory[];
}

export async function countOpenTicketsForUser(
  guildId: string,
  ownerId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("guild_id", guildId)
    .eq("owner_id", ownerId)
    .in("status", ["open", "claimed"]);

  if (error) throw error;
  return count ?? 0;
}

export async function createTicketRecord(input: {
  guildId: string;
  channelId: string;
  ownerId: string;
  categoryId: string;
  priority: string;
}): Promise<TicketRecord> {
  const { data, error } = await supabase
    .from("tickets")
    .insert({
      guild_id: input.guildId,
      channel_id: input.channelId,
      owner_id: input.ownerId,
      category_id: input.categoryId,
      priority: input.priority,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as TicketRecord;
}
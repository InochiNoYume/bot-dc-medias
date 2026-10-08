import type { TicketCategory, TicketRecord } from "./types.js";
import { supabase } from "../../database/supabase.js";

export async function listTicketCategories(guildId: string): Promise<TicketCategory[]> {
  const { data, error } = await supabase.from("ticket_categories").select("*").eq("guild_id", guildId).eq("enabled", true).order("name");
  if (error) throw error;
  const categories = (data ?? []) as unknown as TicketCategory[];
  return categories.filter((category) => Boolean(category.discord_category_id) && category.staff_role_ids.length > 0);
}

export async function getTicketCategory(guildId: string, categoryId: string): Promise<TicketCategory | null> {
  const { data, error } = await supabase.from("ticket_categories").select("*").eq("guild_id", guildId).eq("id", categoryId).maybeSingle();
  if (error) throw error;
  return data as TicketCategory | null;
}

export async function createTicketCategory(input: { guildId: string; name: string; description: string; discordCategoryId: string | null; staffRoleIds: string[]; priority: string; maxOpenPerUser: number; autoCloseMinutes: number | null }): Promise<TicketCategory> {
  if (!input.discordCategoryId || input.staffRoleIds.length === 0) throw new Error("TICKET_CATEGORY_INCOMPLETE");
  const { data, error } = await supabase.from("ticket_categories").insert({
    guild_id: input.guildId, name: input.name, description: input.description, discord_category_id: input.discordCategoryId,
    staff_role_ids: input.staffRoleIds, priority: input.priority, max_open_per_user: input.maxOpenPerUser, auto_close_minutes: input.autoCloseMinutes,
  }).select("*").single();
  if (error) throw error;
  return data as TicketCategory;
}

export async function updateTicketCategoryConfig(guildId: string, categoryId: string, changes: { discordCategoryId?: string | null; staffRoleIds?: string[]; autoCloseMinutes?: number | null }): Promise<TicketCategory> {
  const payload: Record<string, unknown> = {};
  if (changes.discordCategoryId !== undefined) payload.discord_category_id = changes.discordCategoryId;
  if (changes.staffRoleIds !== undefined) payload.staff_role_ids = changes.staffRoleIds;
  if (changes.autoCloseMinutes !== undefined) payload.auto_close_minutes = changes.autoCloseMinutes;
  const { data, error } = await supabase.from("ticket_categories").update(payload).eq("guild_id", guildId).eq("id", categoryId).select("*").single();
  if (error) throw error;
  return data as TicketCategory;
}

export async function countTicketsForCategory(guildId: string, categoryId: string): Promise<number> {
  const { count, error } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("guild_id", guildId)
    .eq("category_id", categoryId);
  if (error) throw error;
  return count ?? 0;
}

export async function deleteTicketCategory(guildId: string, categoryId: string): Promise<void> {
  const { error } = await supabase.from("ticket_categories").delete().eq("guild_id", guildId).eq("id", categoryId);
  if (error) throw error;
}

export async function countOpenTicketsForUser(guildId: string, ownerId: string, categoryId?: string): Promise<number> {
  let q = supabase.from("tickets").select("id", { count: "exact", head: true }).eq("guild_id", guildId).eq("owner_id", ownerId).in("status", ["open", "claimed"]);
  if (categoryId) q = q.eq("category_id", categoryId);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export async function createTicketRecord(input: { guildId: string; channelId: string; ownerId: string; categoryId: string; priority: string }): Promise<TicketRecord> {
  const { data, error } = await supabase.rpc("create_ticket_if_available", {
    p_guild_id: input.guildId,
    p_channel_id: input.channelId,
    p_owner_id: input.ownerId,
    p_category_id: input.categoryId,
    p_priority: input.priority,
  });
  if (error) {
    if (error.message.includes("TICKET_LIMIT_REACHED")) throw new Error("TICKET_LIMIT_REACHED");
    if (error.message.includes("TICKET_CATEGORY_NOT_FOUND")) throw new Error("TICKET_CATEGORY_NOT_FOUND");
    throw error;
  }
  return data as TicketRecord;
}

export async function getTicketPanelByChannel(guildId: string, channelId: string): Promise<{ id: string; message_id: string } | null> {
  const { data, error } = await supabase.from("ticket_panels").select("id,message_id").eq("guild_id", guildId).eq("channel_id", channelId).maybeSingle();
  if (error) throw error;
  return data as { id: string; message_id: string } | null;
}

export async function createTicketPanel(input: { guildId: string; channelId: string; messageId: string; title: string; description: string }): Promise<void> {
  const { error } = await supabase.from("ticket_panels").insert({
    guild_id: input.guildId, channel_id: input.channelId, message_id: input.messageId, title: input.title, description: input.description,
  });
  if (error) throw error;
}

export async function updateTicketPanelMessage(guildId: string, panelId: string, messageId: string): Promise<void> {
  const { error } = await supabase
    .from("ticket_panels")
    .update({ message_id: messageId })
    .eq("guild_id", guildId)
    .eq("id", panelId);
  if (error) throw error;
}

export async function listInactiveTickets(): Promise<Array<TicketRecord & { category: TicketCategory }>> {
  const { data, error } = await supabase
    .from("tickets")
    .select("*, ticket_categories!inner(*)")
    .in("status", ["open", "claimed"])
    .not("ticket_categories.auto_close_minutes", "is", null);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as unknown as TicketRecord),
    category: (row as { ticket_categories: TicketCategory }).ticket_categories,
  }));
}

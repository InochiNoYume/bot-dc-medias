import { supabase } from "../../database/supabase.js";
import type { TicketPriority, TicketRecord, TicketStatus } from "./types.js";

export async function getTicketByChannel(guildId: string, channelId: string): Promise<TicketRecord | null> {
  const { data, error } = await supabase.from("tickets").select("*").eq("guild_id", guildId).eq("channel_id", channelId).maybeSingle();
  if (error) throw error;
  return data as TicketRecord | null;
}

export async function getTicketById(guildId: string, ticketId: string): Promise<TicketRecord | null> {
  const { data, error } = await supabase.from("tickets").select("*").eq("guild_id", guildId).eq("id", ticketId).maybeSingle();
  if (error) throw error;
  return data as TicketRecord | null;
}

export async function updateTicket(ticketId: string, changes: { status?: TicketStatus; priority?: TicketPriority; claimedBy?: string | null; closedBy?: string | null; closeReason?: string | null }): Promise<TicketRecord> {
  const p: Record<string, unknown> = {};
  if (changes.status !== undefined) p.status = changes.status;
  if (changes.priority !== undefined) p.priority = changes.priority;
  if (changes.claimedBy !== undefined) p.claimed_by = changes.claimedBy;
  if (changes.closedBy !== undefined) p.closed_by = changes.closedBy;
  if (changes.closeReason !== undefined) p.close_reason = changes.closeReason;
  if (changes.status === "claimed") p.claimed_at = new Date().toISOString();
  if (changes.status === "closed") p.closed_at = new Date().toISOString();
  if (changes.status === "open") {
    p.closed_at = null;
    p.closed_by = null;
    p.close_reason = null;
    p.claimed_by = null;
  }
  const { data, error } = await supabase.from("tickets").update(p).eq("id", ticketId).select("*").single();
  if (error) throw error;
  return data as TicketRecord;
}

export async function addTicketMember(ticketId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("ticket_members").upsert({ ticket_id: ticketId, user_id: userId });
  if (error) throw error;
}

export async function removeTicketMember(ticketId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("ticket_members").delete().eq("ticket_id", ticketId).eq("user_id", userId);
  if (error) throw error;
}

export async function createTicketRating(input: { ticketId: string; guildId: string; userId: string; rating: number; comment?: string }): Promise<void> {
  const { error } = await supabase.from("ticket_ratings").upsert({
    ticket_id: input.ticketId, guild_id: input.guildId, user_id: input.userId,
    rating: input.rating, comment: input.comment ?? null,
  });
  if (error) throw error;
}

export async function logTicketAction(input: { guildId: string; ticketId: string; actorId: string; action: string; details?: Record<string, unknown> }): Promise<void> {
  const { error } = await supabase.from("ticket_logs").insert({
    guild_id: input.guildId, ticket_id: input.ticketId, actor_id: input.actorId,
    action: input.action, details: input.details ?? {},
  });
  if (error) throw error;
}

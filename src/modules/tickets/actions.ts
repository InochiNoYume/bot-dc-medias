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

export async function updateTicket(ticketId: string, changes: {
  status?: TicketStatus;
  priority?: TicketPriority;
  claimedBy?: string | null;
  expectedClaimedBy?: string | null;
  expectedLastActivityAt?: string;
  closedBy?: string | null;
  closeReason?: string | null;
  archivedAt?: string | null;
}): Promise<TicketRecord> {
  const p: Record<string, unknown> = {};
  if (changes.status !== undefined) p.status = changes.status;
  if (changes.priority !== undefined) p.priority = changes.priority;
  if (changes.claimedBy !== undefined) p.claimed_by = changes.claimedBy;
  if (changes.closedBy !== undefined) p.closed_by = changes.closedBy;
  if (changes.closeReason !== undefined) p.close_reason = changes.closeReason;
  if (changes.archivedAt !== undefined) p.archived_at = changes.archivedAt;
  if (changes.status === "claimed") p.claimed_at = new Date().toISOString();
  if (changes.status === "closed") p.closed_at = new Date().toISOString();
  if (changes.status === "open") {
    p.closed_at = null;
    p.closed_by = null;
    p.close_reason = null;
    p.claimed_by = null;
    p.archived_at = null;
  }
  const { data, error } = await supabase.from("tickets").update(p).eq("id", ticketId).select("*").single();
  if (error) throw error;
  return data as TicketRecord;
}

export async function transitionTicket(input: {
  ticketId: string;
  fromStatuses: TicketStatus[];
  toStatus: TicketStatus;
  claimedBy?: string | null;
  closedBy?: string | null;
  closeReason?: string | null;
}): Promise<TicketRecord> {
  const payload: Record<string, unknown> = { status: input.toStatus };
  if (input.toStatus === "claimed") {
    payload.claimed_by = input.claimedBy ?? null;
    payload.claimed_at = new Date().toISOString();
  }
  if (input.toStatus === "open") {
    payload.claimed_by = null;
    payload.closed_at = null;
    payload.closed_by = null;
    payload.close_reason = null;
    payload.archived_at = null;
  }
  if (input.toStatus === "closed") {
    payload.closed_at = new Date().toISOString();
    payload.closed_by = input.closedBy ?? null;
    payload.close_reason = input.closeReason ?? null;
  }

  let query = supabase.from("tickets").update(payload).eq("id", input.ticketId).in("status", input.fromStatuses);
  if (input.expectedLastActivityAt !== undefined) {
    query = query.eq("last_activity_at", input.expectedLastActivityAt);
  }
  if (input.expectedClaimedBy !== undefined) {
    query = input.expectedClaimedBy === null ? query.is("claimed_by", null) : query.eq("claimed_by", input.expectedClaimedBy);
  }

  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("TICKET_STATE_CONFLICT");
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

export async function getTicketRating(ticketId: string): Promise<{ rating: number } | null> {
  const { data, error } = await supabase.from("ticket_ratings").select("rating").eq("ticket_id", ticketId).maybeSingle();
  if (error) throw error;
  return data as { rating: number } | null;
}

export async function createTicketRating(input: { ticketId: string; guildId: string; userId: string; rating: number; comment?: string }): Promise<void> {
  const { error } = await supabase.from("ticket_ratings").insert({
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

export async function touchTicketActivity(ticketId: string): Promise<void> {
  const { error } = await supabase.from("tickets").update({
    last_activity_at: new Date().toISOString(),
  }).eq("id", ticketId).in("status", ["open", "claimed"]);
  if (error) throw error;
}

export interface TicketLogRecord {
  id: string;
  ticket_id: string;
  actor_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export async function listTicketLogs(ticketId: string, limit = 10): Promise<TicketLogRecord[]> {
  const { data, error } = await supabase
    .from("ticket_logs")
    .select("id,ticket_id,actor_id,action,details,created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as TicketLogRecord[];
}

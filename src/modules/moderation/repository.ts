import { supabase } from "../../database/supabase.js";
import type { ModerationAction, ModerationCase, ModerationNote, ModerationCaseStatus } from "./types.js";

export async function createModerationCase(input: { guildId: string; targetId: string; moderatorId: string; action: ModerationAction; reason: string; durationSeconds?: number | null }): Promise<ModerationCase> {
  const { data, error } = await supabase.from("moderation_cases").insert({
    guild_id: input.guildId, target_id: input.targetId, moderator_id: input.moderatorId,
    action: input.action, reason: input.reason, duration_seconds: input.durationSeconds ?? null,
    status: "pending",
    expires_at: input.durationSeconds ? new Date(Date.now() + input.durationSeconds * 1000).toISOString() : null,
  }).select("*").single();
  if (error) throw error;
  return data as ModerationCase;
}

export async function updateModerationCase(guildId: string, id: string, status: ModerationCaseStatus, metadata: Record<string, unknown> = {}): Promise<void> {
  const { error } = await supabase.from("moderation_cases").update({ status, metadata }).eq("guild_id", guildId).eq("id", id);
  if (error) throw error;
}

export async function listModerationCases(guildId: string, targetId: string, limit = 10): Promise<ModerationCase[]> {
  const { data, error } = await supabase.from("moderation_cases").select("*").eq("guild_id", guildId).eq("target_id", targetId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as ModerationCase[];
}

export async function getModerationCase(guildId: string, caseNumber: number): Promise<ModerationCase | null> {
  const { data, error } = await supabase.from("moderation_cases").select("*").eq("guild_id", guildId).eq("case_number", caseNumber).maybeSingle();
  if (error) throw error;
  return data as ModerationCase | null;
}

export async function createModerationNote(input: { guildId: string; userId: string; staffId: string; note: string }): Promise<ModerationNote> {
  const { data, error } = await supabase.from("moderation_notes").insert({ guild_id: input.guildId, user_id: input.userId, staff_id: input.staffId, note: input.note }).select("*").single();
  if (error) throw error;
  return data as ModerationNote;
}

export async function listModerationNotes(guildId: string, userId: string, limit = 10): Promise<ModerationNote[]> {
  const { data, error } = await supabase.from("moderation_notes").select("*").eq("guild_id", guildId).eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as ModerationNote[];
}


export interface ModerationChannelLock {
  guild_id: string;
  channel_id: string;
  locked_by: string;
  previous_send_messages: boolean | null;
  reason: string;
  created_at: string;
  updated_at: string;
}

export async function getModerationChannelLock(guildId: string, channelId: string): Promise<ModerationChannelLock | null> {
  const { data, error } = await supabase.from("moderation_channel_locks").select("*").eq("guild_id", guildId).eq("channel_id", channelId).maybeSingle();
  if (error) throw error;
  return data as ModerationChannelLock | null;
}

export async function setModerationChannelLock(input: { guildId: string; channelId: string; lockedBy: string; previousSendMessages: boolean | null; reason: string }): Promise<void> {
  const { error } = await supabase.from("moderation_channel_locks").upsert({
    guild_id: input.guildId,
    channel_id: input.channelId,
    locked_by: input.lockedBy,
    previous_send_messages: input.previousSendMessages,
    reason: input.reason,
  }, { onConflict: "channel_id" });
  if (error) throw error;
}

export async function deleteModerationChannelLock(guildId: string, channelId: string): Promise<void> {
  const { error } = await supabase.from("moderation_channel_locks").delete().eq("guild_id", guildId).eq("channel_id", channelId);
  if (error) throw error;
}

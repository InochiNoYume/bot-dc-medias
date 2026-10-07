import { supabase } from "../../database/supabase.js";

export interface AutomodConfig {
  guild_id: string;
  enabled: boolean;
  bad_words: string[];
  blocked_patterns: string[];
  max_mentions: number;
  max_messages: number;
  message_window_seconds: number;
  action: "delete" | "timeout";
  timeout_seconds: number;
  trusted_role_ids: string[];
  raid_enabled: boolean;
  raid_join_threshold: number;
  raid_window_seconds: number;
  raid_action: "alert" | "timeout" | "kick";
  raid_timeout_seconds: number;
  raid_quarantine_role_id: string | null;
  raid_lockdown: boolean;
  raid_active_until: string | null;
  raid_started_at: string | null;
  raid_join_count: number;
}

export interface RaidJoinResult {
  triggered: boolean;
  active: boolean;
  join_count: number;
  active_until: string | null;
  started_at: string | null;
}

export interface LockdownChannelState {
  guild_id: string;
  channel_id: string;
  previous_send_messages: boolean | null;
  locked_at: string;
}

export async function getAutomodConfig(guildId: string): Promise<AutomodConfig | null> {
  const { data, error } = await supabase
    .from("guild_automod_configs")
    .select("*")
    .eq("guild_id", guildId)
    .maybeSingle();

  if (error) throw error;
  return data as AutomodConfig | null;
}

export async function upsertAutomodConfig(
  guildId: string,
  patch: Partial<Omit<AutomodConfig, "guild_id">>,
): Promise<AutomodConfig> {
  const { data, error } = await supabase
    .from("guild_automod_configs")
    .upsert(
      { guild_id: guildId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "guild_id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as AutomodConfig;
}

export async function registerRaidJoin(
  guildId: string,
  threshold: number,
  windowSeconds: number,
): Promise<RaidJoinResult> {
  const { data, error } = await supabase.rpc("register_automod_raid_join", {
    p_guild_id: guildId,
    p_threshold: threshold,
    p_window_seconds: windowSeconds,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("No se recibió estado anti-raid.");

  return {
    triggered: Boolean(row.triggered),
    active: Boolean(row.active),
    join_count: Number(row.join_count),
    active_until: row.active_until ?? null,
    started_at: row.started_at ?? null,
  };
}

export async function saveLockdownChannel(
  guildId: string,
  channelId: string,
  previousSendMessages: boolean | null,
): Promise<void> {
  const { error } = await supabase
    .from("automod_lockdown_channels")
    .upsert(
      {
        guild_id: guildId,
        channel_id: channelId,
        previous_send_messages: previousSendMessages,
      },
      { onConflict: "channel_id" },
    );

  if (error) throw error;
}

export async function getLockdownChannels(guildId: string): Promise<LockdownChannelState[]> {
  const { data, error } = await supabase
    .from("automod_lockdown_channels")
    .select("guild_id, channel_id, previous_send_messages, locked_at")
    .eq("guild_id", guildId);

  if (error) throw error;
  return (data ?? []) as LockdownChannelState[];
}

export async function clearLockdownChannels(guildId: string): Promise<void> {
  const { error } = await supabase
    .from("automod_lockdown_channels")
    .delete()
    .eq("guild_id", guildId);

  if (error) throw error;
}

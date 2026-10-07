import { supabase } from "../supabase.js";

export interface GuildLogConfig {
  guild_id: string;
  channel_id: string | null;
  enabled_events: string[];
  created_at: string;
  updated_at: string;
}

export async function getGuildLogConfig(guildId: string): Promise<GuildLogConfig | null> {
  const { data, error } = await supabase
    .from("guild_log_configs")
    .select("*")
    .eq("guild_id", guildId)
    .maybeSingle();

  if (error) throw error;
  return data as GuildLogConfig | null;
}

export async function setGuildLogConfig(
  guildId: string,
  channelId: string | null,
  enabledEvents?: string[],
): Promise<GuildLogConfig> {
  const payload: Record<string, unknown> = {
    guild_id: guildId,
    channel_id: channelId,
    updated_at: new Date().toISOString(),
  };

  if (enabledEvents) payload.enabled_events = enabledEvents;

  const { data, error } = await supabase
    .from("guild_log_configs")
    .upsert(payload, { onConflict: "guild_id" })
    .select("*")
    .single();

  if (error) throw error;
  return data as GuildLogConfig;
}

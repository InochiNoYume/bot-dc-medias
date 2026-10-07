import { supabase } from "../supabase.js";
import type { GuildRecord, GuildSettingsRecord } from "../types.js";

export async function ensureGuild(guildId: string, name: string): Promise<void> {
  const now = new Date().toISOString();

  const { error: guildError } = await supabase
    .from("guilds")
    .upsert(
      { guild_id: guildId, name, updated_at: now },
      { onConflict: "guild_id" },
    );

  if (guildError) throw guildError;

  const { error: settingsError } = await supabase
    .from("guild_settings")
    .upsert(
      { guild_id: guildId, updated_at: now },
      { onConflict: "guild_id" },
    );

  if (settingsError) throw settingsError;
}

export async function getGuildSettings(
  guildId: string,
): Promise<GuildSettingsRecord | null> {
  const { data, error } = await supabase
    .from("guild_settings")
    .select("*")
    .eq("guild_id", guildId)
    .maybeSingle();

  if (error) throw error;
  return data as GuildSettingsRecord | null;
}

export async function setSetupCompleted(
  guildId: string,
  completed: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("guild_settings")
    .update({
      setup_completed: completed,
      updated_at: new Date().toISOString(),
    })
    .eq("guild_id", guildId);

  if (error) throw error;
}

export async function setTicketArchiveCategory(
  guildId: string,
  categoryId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("guild_settings")
    .update({
      ticket_archive_category_id: categoryId,
      updated_at: new Date().toISOString(),
    })
    .eq("guild_id", guildId);

  if (error) throw error;
}

export async function listGuilds(): Promise<GuildRecord[]> {
  const { data, error } = await supabase
    .from("guilds")
    .select("*")
    .order("name");

  if (error) throw error;
  return (data ?? []) as GuildRecord[];
}

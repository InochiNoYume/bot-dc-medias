import { supabase } from "../database/supabase.js";

export async function verifyDatabaseConnection(): Promise<void> {
  const { error } = await supabase.from("guilds").select("guild_id").limit(1);
  if (error) throw new Error(`Supabase connection failed: ${error.message}`);
  console.log("[DATABASE] Supabase conectado.");
}

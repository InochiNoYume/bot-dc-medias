import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requiredGuildIds(): string[] {
  const value = required("ALLOWED_GUILD_IDS");
  const ids = value.split(",").map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) throw new Error("ALLOWED_GUILD_IDS must contain at least one guild ID");
  if (ids.some((id) => !/^\d{17,20}$/.test(id))) {
    throw new Error("ALLOWED_GUILD_IDS contains an invalid Discord guild ID");
  }
  return [...new Set(ids)];
}

export const env = {
  discordToken: required("DISCORD_TOKEN"),
  discordClientId: required("DISCORD_CLIENT_ID"),
  allowedGuildIds: requiredGuildIds(),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  twitchClientId: process.env.TWITCH_CLIENT_ID ?? "",
  twitchClientSecret: process.env.TWITCH_CLIENT_SECRET ?? "",
  kickClientId: process.env.KICK_CLIENT_ID ?? "",
  kickClientSecret: process.env.KICK_CLIENT_SECRET ?? "",
} as const;

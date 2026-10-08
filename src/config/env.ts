import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  discordToken: required("DISCORD_TOKEN"),
  discordClientId: required("DISCORD_CLIENT_ID"),
  devGuildId: required("DEV_GUILD_ID"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  twitchClientId: process.env.TWITCH_CLIENT_ID ?? "",
  twitchClientSecret: process.env.TWITCH_CLIENT_SECRET ?? "",
  kickClientId: process.env.KICK_CLIENT_ID ?? "",
  kickClientSecret: process.env.KICK_CLIENT_SECRET ?? "",
} as const;

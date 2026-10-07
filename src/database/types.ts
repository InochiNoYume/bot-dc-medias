export interface GuildRecord {
  guild_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface GuildSettingsRecord {
  guild_id: string;
  locale: string;
  timezone: string;
  setup_completed: boolean;
  created_at: string;
  updated_at: string;
}
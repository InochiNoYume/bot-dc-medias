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
  ticket_archive_category_id: string | null;
  created_at: string;
  updated_at: string;
}

export type TicketStatus = "open" | "claimed" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

export interface TicketCategory {
  id: string;
  guild_id: string;
  name: string;
  description: string | null;
  discord_category_id: string | null;
  staff_role_ids: string[];
  priority: TicketPriority;
  max_open_per_user: number;
  auto_close_minutes: number | null;
  enabled: boolean;
}

export interface TicketRecord {
  id: string;
  guild_id: string;
  ticket_number: number;
  display_number: number | null;
  channel_id: string;
  owner_id: string;
  category_id: string;
  status: TicketStatus;
  priority: TicketPriority;
  claimed_by: string | null;
  created_at: string;
  claimed_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  close_reason: string | null;
  archived_at: string | null;
}

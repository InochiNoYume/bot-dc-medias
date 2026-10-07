export type ModerationAction = "warn" | "timeout" | "kick" | "ban" | "unban";
export type ModerationCaseStatus = "pending" | "completed" | "failed";

export interface ModerationCase {
  id: string;
  guild_id: string;
  case_number: number;
  target_id: string;
  moderator_id: string;
  action: ModerationAction;
  reason: string;
  duration_seconds: number | null;
  status: ModerationCaseStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  expires_at: string | null;
}

export interface ModerationNote {
  id: string;
  guild_id: string;
  user_id: string;
  staff_id: string;
  note: string;
  created_at: string;
}

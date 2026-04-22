export const MAX_SYNC_ATTEMPTS = 3;
export const RETRY_DELAY_MINUTES = 5;
export const DEFAULT_SYNC_BATCH_SIZE = 20;

export type SyncEntityType = "deadline" | "work_block";
export type SyncAction = "upsert" | "delete";

export interface SyncSummary {
  pendingCount: number;
  failedCount: number;
  lastFailureReason: string | null;
}

export interface ClaimedCalendarSyncJob {
  id: string;
  user_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  action: SyncAction;
  target_calendar_id: string | null;
  google_event_id: string | null;
  attempts: number;
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

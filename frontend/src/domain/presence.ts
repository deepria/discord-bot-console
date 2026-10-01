export const PRESENCE_STATUSES = [
  "online",
  "idle",
  "dnd",
  "invisible",
] as const;
export const PRESENCE_ACTIVITIES = [
  "playing",
  "watching",
  "listening",
] as const;
export const PRESENCE_MODES = ["auto", "manual"] as const;
export const PRESENCE_OPERATIONS = [
  "queued",
  "applying",
  "success",
  "failure",
  "unknown",
] as const;

export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];
export type PresenceActivity = (typeof PRESENCE_ACTIVITIES)[number];
export interface PresenceConfiguration {
  mode: (typeof PRESENCE_MODES)[number];
  status: PresenceStatus;
  activity_type: PresenceActivity;
  activity_text: string;
}
export interface PresenceSnapshot {
  configured: PresenceConfiguration;
  manual: PresenceConfiguration;
  last_sent: PresenceConfiguration | null;
  last_sent_at: string | null;
  connected: boolean;
  apply_state: "pending" | "sent" | "unknown" | "unavailable";
  operation: {
    request_id: string;
    state: (typeof PRESENCE_OPERATIONS)[number];
    error: string | null;
    completed_at: string | null;
  } | null;
  capabilities: {
    statuses: PresenceStatus[];
    activity_types: PresenceActivity[];
    text_max_length: number;
  };
  audit: {
    request_id: string;
    actor_kind: string;
    actor_id: string;
    action: string;
    outcome: string;
    occurred_at: string;
  }[];
}

export const STATUS_LABELS: Record<PresenceStatus, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  invisible: "Invisible",
};
export const ACTIVITY_LABELS: Record<PresenceActivity, string> = {
  playing: "Playing",
  watching: "Watching",
  listening: "Listening",
};

export function presenceTextError(
  text: string,
  maximum: number,
): string | null {
  if (/[\p{Cc}\p{Cs}]/u.test(text))
    return "Activity Text에 제어 문자를 사용할 수 없습니다.";
  const length = Array.from(text.trim()).length;
  return length < 1 || length > maximum
    ? `Activity Text는 공백을 제외하고 1~${maximum}자여야 합니다.`
    : null;
}

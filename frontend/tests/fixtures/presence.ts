import type { PresenceSnapshot } from "../../src/domain/presence";

export function presenceFixture(): PresenceSnapshot {
  const manual = {
    mode: "manual",
    status: "dnd",
    activity_type: "playing",
    activity_text: "코드 수정 중",
  } as const;
  return {
    configured: { ...manual },
    manual: { ...manual },
    last_sent: { ...manual },
    last_sent_at: "2026-10-01T00:00:00Z",
    connected: true,
    apply_state: "sent",
    operation: null,
    capabilities: {
      statuses: ["online", "idle", "dnd", "invisible"],
      activity_types: ["playing", "watching", "listening"],
      text_max_length: 128,
    },
    audit: [],
  };
}

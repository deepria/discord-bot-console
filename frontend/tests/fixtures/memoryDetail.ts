import type { MemoryDetailResponse } from "../../src/types/api";

export function memoryDetailFixture(): MemoryDetailResponse {
  return {
    source_status: "HEALTHY",
    source: {
      status: "HEALTHY",
      last_success_at: "2026-10-15T07:00:00Z",
      error_code: null,
    },
    memory: {
      id: 1,
      owner_id: "99",
      owner_type: "user",
      kind: "preference",
      content: "간결한 답변을 선호한다.",
      disclosure: "owner_private",
      confidence: 0.9,
      origin_realm: "guild:10",
      origin_channel_id: "20",
      origin_public_at_capture: true,
      status: "active",
      superseded_by: null,
      created_at: "2026-10-01T12:00:00Z",
      updated_at: "2026-10-01T12:00:00Z",
      usage_state: "shadow_only",
      sources: [
        {
          message_id: "100",
          turn_id: null,
          message_url: "https://discord.com/channels/10/20/100",
        },
      ],
    },
  };
}

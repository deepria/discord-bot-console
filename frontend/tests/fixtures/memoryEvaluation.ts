import type { MemoryEvaluationResponse } from "../../src/types/api";

export function memoryEvaluationFixture(): MemoryEvaluationResponse {
  return {
    checked_at: "2026-10-15T06:00:00Z",
    source: {
      status: "HEALTHY",
      last_success_at: "2026-10-15T06:00:00Z",
      error_code: null,
    },
    evaluation: {
      source_status: "HEALTHY",
      items: {
        total: 38,
        active: 38,
        superseded: 0,
        deleted: 0,
        other_status: 0,
      },
      provenance: { active_message_linked: 38, active_turn_linked: 38 },
      observation: {
        first_item_at: "2026-09-24T00:00:00Z",
        last_item_at: "2026-10-15T04:00:00Z",
        elapsed_days: 21,
      },
      readiness: {
        minimum_active_items: 50,
        minimum_days: 7,
        ready_for_metadata_review: false,
        reasons: ["insufficient_active_items"],
      },
    },
  };
}

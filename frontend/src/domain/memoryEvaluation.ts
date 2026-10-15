export const MEMORY_EVALUATION_REASONS: Record<string, string> = {
  database_unavailable: "기억 저장소를 조회할 수 없습니다.",
  shadow_schema_unavailable:
    "평가에 필요한 기억 저장 형식이 준비되지 않았습니다.",
  database_read_failed: "기억 metadata 조회에 실패했습니다.",
  insufficient_active_items: "활성 표본을 더 수집해야 합니다.",
  insufficient_observation_days: "관찰 기간이 더 필요합니다.",
  invalid_item_timestamp: "생성 시각을 확인할 수 없는 항목이 있습니다.",
  missing_message_provenance: "원본 메시지 연결이 불완전한 항목이 있습니다.",
  missing_turn_provenance: "대화 turn 연결이 불완전한 항목이 있습니다.",
  unknown_lifecycle_status: "분류되지 않은 상태의 항목이 있습니다.",
};

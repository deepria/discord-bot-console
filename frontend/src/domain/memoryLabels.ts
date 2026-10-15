export const MEMORY_KIND_LABELS: Record<string, string> = {
  fact: "사실",
  preference: "선호",
  event: "사건",
  relationship: "관계",
  boundary: "제약",
  task: "작업",
};
export const MEMORY_STATUS_LABELS: Record<string, string> = {
  active: "현재 후보",
  superseded: "다른 후보로 대체됨",
  deleted: "삭제 처리됨",
};
export const MEMORY_SCOPE_LABELS: Record<string, string> = {
  owner_private: "개인 범위",
  channel: "채널 범위",
};
export const MEMORY_OWNER_LABELS: Record<string, string> = {
  user: "사용자",
  guild: "서버",
  global: "전체",
};

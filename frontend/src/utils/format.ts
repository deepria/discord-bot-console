export function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null) return "-";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

export function formatKst(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatEventDetails(event: Record<string, unknown>): string {
  const diagnosis = formatEventDiagnosis(event);
  if (diagnosis) return diagnosis;
  const hidden = new Set(["message_id", "guild_id", "channel_id", "user_id", "response_message_id"]);
  const details = Object.fromEntries(
    Object.entries(event).filter(([key]) => key !== "at" && key !== "event" && !hidden.has(key)),
  );
  return Object.keys(details).length ? JSON.stringify(details) : "";
}

export function formatEventDiagnosis(event: Record<string, unknown>): string | null {
  if (event.event !== "turn_failed") return null;
  const error = event.error_type;
  if (error === "ReadTimeout") {
    return "PROVIDER RESPONSE TIMEOUT · 모델 응답이 client timeout 안에 도착하지 않았습니다";
  }
  if (error === "ConnectTimeout") return "PROVIDER CONNECTION TIMEOUT · API 연결을 완료하지 못했습니다";
  if (error === "ProviderAPIError") return "PROVIDER API ERROR · usage trace에서 HTTP 상태를 확인하세요";
  return typeof error === "string" ? `TURN FAILED · ${error}` : "TURN FAILED";
}

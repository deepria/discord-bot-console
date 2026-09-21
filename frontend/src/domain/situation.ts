import type { MonitorId, SceneState } from "../types/api";

export type SituationLevel =
  "healthy" | "advisory" | "action-required" | "unavailable";

export interface Situation {
  level: SituationLevel;
  scene: SceneState;
  title: string;
  reason: string;
  impact: string;
  detail: string;
  recommendedMonitor?: MonitorId;
  recommendedAction?: "inspect" | "logs";
}

export interface SituationInput {
  hasStatus: boolean;
  statusError: boolean;
  stale: boolean;
  online: boolean;
  eventsError: boolean;
  deploymentFailed: boolean;
  deploymentsError: boolean;
  latencyMs: number | null | undefined;
  latencyWarningMs: number;
}

export function deriveSituation(input: SituationInput): Situation {
  if (!input.hasStatus && input.statusError) {
    return {
      level: "unavailable",
      scene: "alert",
      title: "AGENT LINK UNAVAILABLE",
      reason: "관제 데이터를 처음부터 가져오지 못했습니다.",
      impact: "현재 Bot 상태와 최근 이벤트를 검증할 수 없습니다.",
      detail: "AGENT LINK / UNAVAILABLE",
      recommendedMonitor: "link",
      recommendedAction: "inspect",
    };
  }

  if (!input.hasStatus) {
    return {
      level: "advisory",
      scene: "loading",
      title: "STATUS CHECK IN PROGRESS",
      reason: "운영 상태를 수집하고 있습니다.",
      impact: "최신 확인이 끝날 때까지 제어 판단을 보류합니다.",
      detail: "AGENT LINK / AWAITING RESPONSE",
    };
  }

  if (input.statusError) {
    return {
      level: "action-required",
      scene: "alert",
      title: "DATA LINK CHECK REQUIRED",
      reason: "Agent 응답을 받지 못했습니다.",
      impact: "표시 중인 데이터가 최신 상태가 아닐 수 있습니다.",
      detail: "LAST KNOWN STATE / RESPONSE STALE",
      recommendedMonitor: "link",
      recommendedAction: "inspect",
    };
  }

  if (!input.online) {
    return {
      level: "action-required",
      scene: "alert",
      title: "BOT SERVICE OFFLINE",
      reason: "Rio Bot 서비스가 오프라인입니다.",
      impact: "Discord 메시지에 응답할 수 없습니다.",
      detail: "SYSTEM STATUS / BOT OFFLINE",
      recommendedMonitor: "system",
      recommendedAction: "inspect",
    };
  }

  if (input.stale) {
    return {
      level: "action-required",
      scene: "alert",
      title: "STATUS VERIFICATION STALE",
      reason: "마지막 정상 응답 이후 새 상태를 확인하지 못했습니다.",
      impact: "운영 판단이 오래된 데이터에 의존할 수 있습니다.",
      detail: "DATA LINK / STATUS STALE",
      recommendedMonitor: "link",
      recommendedAction: "inspect",
    };
  }

  if (input.deploymentFailed) {
    return {
      level: "action-required",
      scene: "alert",
      title: "DEPLOYMENT FAILURE DETECTED",
      reason: "최근 배포 작업이 실패했습니다.",
      impact: "일부 구성요소가 기대한 revision으로 실행되지 않을 수 있습니다.",
      detail: "DEPLOY WATCH / FAILURE",
      recommendedMonitor: "deploy",
      recommendedAction: "inspect",
    };
  }

  if (input.eventsError || input.deploymentsError) {
    return {
      level: "advisory",
      scene: "healthy",
      title: "PARTIAL TELEMETRY",
      reason: input.eventsError
        ? "일부 이벤트 데이터를 수집하지 못했습니다."
        : "배포 상태를 갱신하지 못했습니다.",
      impact: "서비스는 동작 중이지만 일부 관측 데이터가 불완전합니다.",
      detail: "PARTIAL AGENT RESPONSE",
      recommendedMonitor: input.eventsError ? "link" : "deploy",
      recommendedAction: "inspect",
    };
  }

  if (
    input.latencyMs !== null &&
    input.latencyMs !== undefined &&
    input.latencyMs > input.latencyWarningMs
  ) {
    return {
      level: "advisory",
      scene: "healthy",
      title: "DISCORD LATENCY ELEVATED",
      reason: `Discord latency가 ${input.latencyMs} ms입니다.`,
      impact: "응답 시간이 평소보다 길어질 수 있습니다.",
      detail: `RUNTIME / ${input.latencyMs} MS`,
      recommendedMonitor: "runtime",
      recommendedAction: "inspect",
    };
  }

  return {
    level: "healthy",
    scene: "healthy",
    title: "SYSTEM HEALTHY",
    reason: "Bot과 Agent 연결이 정상적으로 확인되었습니다.",
    impact: "현재 조치가 필요하지 않습니다.",
    detail: "AGENT LINK / ESTABLISHED",
  };
}

import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { api } from "../services/api";
import type {
  BotStatus,
  ControlAction,
  ControlResult,
  DeploymentsResponse,
  LogConnectionState,
  MonitorId,
  MonitorStatus,
  RuntimeEvent,
  SceneState,
} from "../types/api";

const LATENCY_WARNING_MS = 500;
const MAX_LOG_LINES = 800;
const MAX_KNOWN_EVENTS = 500;

function eventKey(event: RuntimeEvent): string {
  const identifiers = [
    event.at,
    event.event,
    event.message_id,
    event.request_id,
  ]
    .filter((value) => value !== null && value !== undefined)
    .map(String);
  return identifiers.length ? identifiers.join(":") : JSON.stringify(event);
}

function deploymentFailed(data: DeploymentsResponse | null): boolean {
  if (!data) return false;
  const items = [data.console, ...data.deployments].filter(Boolean);
  return items.some((item) => {
    const service = item?.service ?? {};
    const state = String(
      item?.state ?? service.ActiveState ?? "",
    ).toLowerCase();
    const result = String(service.Result ?? "").toLowerCase();
    return state.includes("fail") || result.includes("fail");
  });
}

export const useOperationsStore = defineStore("operations", () => {
  const status = ref<BotStatus | null>(null);
  const statusError = ref<string | null>(null);
  const stale = ref(false);
  const lastStatusAt = ref<Date | null>(null);
  const statusInFlight = ref(false);

  const deployments = ref<DeploymentsResponse | null>(null);
  const deploymentsError = ref<string | null>(null);
  const lastDeploymentsAt = ref<Date | null>(null);
  const deploymentsInFlight = ref(false);

  const selectedMonitor = ref<MonitorId | null>(null);
  const unseenEventCount = ref(0);
  const knownEventKeys = new Set<string>();
  let eventsInitialized = false;

  const logs = ref<string[]>([]);
  const logConnection = ref<LogConnectionState>("connecting");
  const logError = ref<string | null>(null);
  const followingLogs = ref(true);
  const unseenLogCount = ref(0);

  const control = ref<ControlResult>({
    action: "restart",
    state: "idle",
    message: "",
  });

  const scene = computed<SceneState>(() => {
    if (!status.value && !statusError.value) return "loading";
    if (
      !status.value ||
      statusError.value ||
      stale.value ||
      !status.value.online
    )
      return "alert";
    return "healthy";
  });

  const briefing = computed(() => {
    if (control.value.state === "requesting") {
      return {
        message: "요청을 실행하고 있어.",
        detail: `${control.value.action.toUpperCase()} / AWAITING RESPONSE`,
      };
    }
    if (
      control.value.state === "failure" ||
      control.value.state === "success"
    ) {
      return {
        message: control.value.message,
        detail: `RIO CONTROL / ${control.value.state.toUpperCase()}`,
      };
    }
    if (scene.value === "loading") {
      return {
        message: "시스템 상태를 확인하고 있습니다.",
        detail: "AGENT LINK / AWAITING RESPONSE",
      };
    }
    if (!status.value) {
      return {
        message: "관제 데이터에 연결할 수 없어.",
        detail: "AGENT LINK UNAVAILABLE",
      };
    }
    if (stale.value || statusError.value) {
      return {
        message: "응답이 늦어지고 있어. DATA LINK를 먼저 확인해 봐.",
        detail: "LAST KNOWN STATE / RESPONSE STALE",
      };
    }
    if (!status.value.online) {
      return {
        message: "봇이 오프라인이야. SYSTEM STATUS를 확인해 봐.",
        detail: "BOT SERVICE OFFLINE / CT-101",
      };
    }
    if (status.value.events_error) {
      return {
        message: "일부 이벤트 데이터를 받지 못했어. DATA LINK를 확인해 봐.",
        detail: "PARTIAL AGENT RESPONSE",
      };
    }
    return {
      message: "문제없어. 시스템은 정상적으로 운영 중이야.",
      detail: `GUILDS ${status.value.runtime?.guild_count ?? "-"} / AGENT LINK ESTABLISHED`,
    };
  });

  const monitorStatuses = computed<Record<MonitorId, MonitorStatus>>(() => {
    const runtimeLatency = status.value?.runtime?.latency_ms;
    const systemAlert = !status.value || stale.value || !status.value.online;
    const linkAlert = Boolean(statusError.value || status.value?.events_error);
    const deployAlert = deploymentFailed(deployments.value);
    return {
      system: {
        id: "system",
        label: "SYSTEM STATUS",
        severity: systemAlert ? "alert" : "normal",
        summary: !status.value
          ? "UNAVAILABLE"
          : stale.value
            ? "STALE"
            : status.value.online
              ? "ONLINE"
              : "OFFLINE",
      },
      link: {
        id: "link",
        label: "DATA LINK",
        severity: linkAlert ? "alert" : "normal",
        summary: linkAlert ? "CHECK LINK" : "CONNECTED",
      },
      runtime: {
        id: "runtime",
        label: "DISCORD / AI",
        severity:
          runtimeLatency !== null &&
          runtimeLatency !== undefined &&
          runtimeLatency > LATENCY_WARNING_MS
            ? "attention"
            : "normal",
        summary: runtimeLatency == null ? "NO DATA" : `${runtimeLatency} MS`,
      },
      events: {
        id: "events",
        label: "LIVE EVENTS",
        severity: status.value?.events_error
          ? "alert"
          : unseenEventCount.value > 0
            ? "attention"
            : "normal",
        summary: `${status.value?.events.length ?? 0} EVENTS`,
        badge: unseenEventCount.value || undefined,
      },
      logs: {
        id: "logs",
        label: "LOG STREAM",
        severity:
          logConnection.value === "reconnecting" ||
          logConnection.value === "closed"
            ? "attention"
            : "normal",
        summary: logConnection.value.toUpperCase(),
        badge: unseenLogCount.value || undefined,
      },
      deploy: {
        id: "deploy",
        label: "DEPLOY WATCH",
        severity:
          deployAlert || deploymentsError.value ? "attention" : "normal",
        summary: deployAlert
          ? "FAILED"
          : deploymentsError.value
            ? "UNAVAILABLE"
            : "READY",
      },
      control: {
        id: "control",
        label: "RIO CONTROL",
        severity: control.value.state === "failure" ? "alert" : "normal",
        summary: control.value.state === "requesting" ? "BUSY" : "AUTHORIZED",
      },
    };
  });

  function ingestEvents(events: RuntimeEvent[]): void {
    const keys = events.map(eventKey);
    if (eventsInitialized) {
      const newCount = keys.filter((key) => !knownEventKeys.has(key)).length;
      if (selectedMonitor.value !== "events") {
        unseenEventCount.value = Math.min(
          unseenEventCount.value + newCount,
          MAX_KNOWN_EVENTS,
        );
      }
    }
    keys.forEach((key) => knownEventKeys.add(key));
    while (knownEventKeys.size > MAX_KNOWN_EVENTS) {
      const oldest = knownEventKeys.values().next().value;
      if (oldest === undefined) break;
      knownEventKeys.delete(oldest);
    }
    eventsInitialized = true;
  }

  async function refreshStatus(): Promise<void> {
    if (statusInFlight.value) return;
    statusInFlight.value = true;
    try {
      const next = await api.getStatus();
      ingestEvents(next.events);
      status.value = next;
      stale.value = false;
      statusError.value = null;
      lastStatusAt.value = new Date();
    } catch (error) {
      statusError.value =
        error instanceof Error ? error.message : "Status request failed.";
      stale.value = Boolean(status.value);
    } finally {
      statusInFlight.value = false;
    }
  }

  async function refreshDeployments(): Promise<void> {
    if (deploymentsInFlight.value) return;
    deploymentsInFlight.value = true;
    try {
      deployments.value = await api.getDeployments();
      deploymentsError.value = null;
      lastDeploymentsAt.value = new Date();
    } catch (error) {
      deploymentsError.value =
        error instanceof Error ? error.message : "Deployment request failed.";
    } finally {
      deploymentsInFlight.value = false;
    }
  }

  function selectMonitor(id: MonitorId | null): void {
    selectedMonitor.value = id;
    if (id === "events") unseenEventCount.value = 0;
    if (id === "logs") unseenLogCount.value = 0;
  }

  function replaceLogs(lines: string[]): void {
    logs.value = lines.slice(-MAX_LOG_LINES);
  }

  function appendLog(line: string): void {
    logs.value = [...logs.value, line].slice(-MAX_LOG_LINES);
    if (!followingLogs.value || selectedMonitor.value !== "logs") {
      unseenLogCount.value = Math.min(unseenLogCount.value + 1, MAX_LOG_LINES);
    }
  }

  function setFollowingLogs(following: boolean): void {
    followingLogs.value = following;
    if (following) unseenLogCount.value = 0;
  }

  async function runControl(action: ControlAction): Promise<boolean> {
    if (control.value.state === "requesting") return false;
    control.value = { action, state: "requesting", message: "" };
    try {
      await api.control(action);
      control.value = {
        action,
        state: "success",
        message:
          action === "stop"
            ? "봇 중지 요청을 완료했어."
            : `${action === "start" ? "시작" : "재시작"} 요청을 완료했어.`,
      };
      window.setTimeout(() => {
        void refreshStatus();
      }, 800);
      return true;
    } catch (error) {
      control.value = {
        action,
        state: "failure",
        message:
          error instanceof Error
            ? `작업에 실패했어: ${error.message}`
            : "작업에 실패했어.",
      };
      return false;
    }
  }

  return {
    status,
    statusError,
    stale,
    lastStatusAt,
    deployments,
    deploymentsError,
    lastDeploymentsAt,
    selectedMonitor,
    unseenEventCount,
    logs,
    logConnection,
    logError,
    followingLogs,
    unseenLogCount,
    control,
    scene,
    briefing,
    monitorStatuses,
    refreshStatus,
    refreshDeployments,
    selectMonitor,
    replaceLogs,
    appendLog,
    setFollowingLogs,
    runControl,
  };
});

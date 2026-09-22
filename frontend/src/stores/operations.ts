import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { api } from "../services/api";
import { deriveSituation } from "../domain/situation";
import type {
  BotStatus,
  ControlAction,
  ControlResult,
  DeploymentsResponse,
  LogConnectionState,
  MonitorId,
  MonitorStatus,
  RuntimeEvent,
  RuntimeConfigAuditEvent,
  RuntimeSetting,
  PolicySetting,
  SceneState,
  OperationRecord,
  PostCheckState,
} from "../types/api";

const LATENCY_WARNING_MS = 500;
const MAX_LOG_LINES = 800;
const MAX_KNOWN_EVENTS = 500;
const MAX_OPERATION_HISTORY = 20;

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
  const controlPostCheck = ref<PostCheckState>("idle");
  const operationsHistory = ref<OperationRecord[]>([]);

  const runtimeSettings = ref<RuntimeSetting[]>([]);
  const runtimeSettingsError = ref<string | null>(null);
  const runtimeSettingsLoading = ref(false);
  const lastRuntimeSettingsAt = ref<Date | null>(null);
  const runtimeConfigAuditEvents = ref<RuntimeConfigAuditEvent[]>([]);
  const runtimeConfigAuditError = ref<string | null>(null);
  const runtimeConfigAuditLoading = ref(false);
  const runtimeSettingPending = ref<string | null>(null);
  const runtimeSettingResult = ref<string | null>(null);
  const policySettings = ref<PolicySetting[]>([]);
  const policySettingsError = ref<string | null>(null);
  const policySettingsLoading = ref(false);

  const situation = computed(() =>
    deriveSituation({
      hasStatus: Boolean(status.value),
      statusError: Boolean(statusError.value),
      stale: stale.value,
      online: status.value?.online ?? false,
      eventsError: Boolean(status.value?.events_error),
      deploymentFailed: deploymentFailed(deployments.value),
      deploymentsError: Boolean(deploymentsError.value),
      latencyMs: status.value?.runtime?.latency_ms,
      latencyWarningMs: LATENCY_WARNING_MS,
    }),
  );

  const scene = computed<SceneState>(() => situation.value.scene);

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
    if (situation.value.level !== "healthy") {
      return {
        message: situation.value.reason,
        detail: situation.value.detail,
      };
    }
    return {
      message: "문제없어. 시스템은 정상적으로 운영 중이야.",
      detail: `GUILDS ${status.value?.runtime?.guild_count ?? "-"} / AGENT LINK ESTABLISHED`,
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

  async function refreshRuntimeSettings(): Promise<void> {
    if (runtimeSettingsLoading.value) return;
    runtimeSettingsLoading.value = true;
    try {
      runtimeSettings.value = (await api.getRuntimeSettings()).settings;
      runtimeSettingsError.value = null;
      lastRuntimeSettingsAt.value = new Date();
    } catch (error) {
      runtimeSettingsError.value =
        error instanceof Error
          ? error.message
          : "Runtime settings request failed.";
    } finally {
      runtimeSettingsLoading.value = false;
    }
  }

  async function refreshRuntimeConfigAuditEvents(): Promise<void> {
    if (runtimeConfigAuditLoading.value) return;
    runtimeConfigAuditLoading.value = true;
    try {
      runtimeConfigAuditEvents.value = (
        await api.getRuntimeConfigAuditEvents()
      ).events;
      runtimeConfigAuditError.value = null;
    } catch (error) {
      runtimeConfigAuditError.value =
        error instanceof Error
          ? error.message
          : "Runtime audit request failed.";
    } finally {
      runtimeConfigAuditLoading.value = false;
    }
  }

  async function refreshPolicySettings(): Promise<void> {
    if (policySettingsLoading.value) return;
    policySettingsLoading.value = true;
    try {
      policySettings.value = (await api.getPolicySettings()).policies;
      policySettingsError.value = null;
    } catch (error) {
      policySettingsError.value =
        error instanceof Error
          ? error.message
          : "Policy settings request failed.";
    } finally {
      policySettingsLoading.value = false;
    }
  }

  async function writeRuntimeSetting(
    key: string,
    value: string | null,
  ): Promise<boolean> {
    if (runtimeSettingPending.value) return false;
    runtimeSettingPending.value = key;
    runtimeSettingResult.value = null;
    try {
      if (value === null)
        await api.resetRuntimeSetting(key, crypto.randomUUID());
      else await api.setRuntimeSetting(key, value, crypto.randomUUID());
      await Promise.all([
        refreshRuntimeSettings(),
        refreshRuntimeConfigAuditEvents(),
      ]);
      runtimeSettingResult.value = "서버의 최신 설정을 다시 확인했습니다.";
      return true;
    } catch (error) {
      runtimeSettingResult.value =
        error instanceof Error
          ? `변경 실패: ${error.message}`
          : "변경에 실패했습니다.";
      return false;
    } finally {
      runtimeSettingPending.value = null;
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
    controlPostCheck.value = "pending";
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
      await Promise.all([refreshStatus(), refreshDeployments(), refreshLogs()]);
      const postCheckHealthy =
        action === "stop"
          ? status.value?.online === false
          : status.value?.online === true;
      controlPostCheck.value = postCheckHealthy ? "healthy" : "failed";
      const successfulOperation: OperationRecord = {
        id: crypto.randomUUID(),
        kind: action,
        requestedAt: new Date().toISOString(),
        result: "success",
        postCheck: controlPostCheck.value,
        relatedMonitor: "control",
      };
      operationsHistory.value = [
        successfulOperation,
        ...operationsHistory.value,
      ].slice(0, MAX_OPERATION_HISTORY);
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
      controlPostCheck.value = "failed";
      const failedOperation: OperationRecord = {
        id: crypto.randomUUID(),
        kind: action,
        requestedAt: new Date().toISOString(),
        result: "failure",
        postCheck: "failed",
        relatedMonitor: "control",
      };
      operationsHistory.value = [
        failedOperation,
        ...operationsHistory.value,
      ].slice(0, MAX_OPERATION_HISTORY);
      return false;
    }
  }

  async function refreshLogs(): Promise<void> {
    try {
      replaceLogs((await api.getLogs()).logs);
    } catch {
      // The status result remains the source of truth when logs are unavailable.
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
    controlPostCheck,
    operationsHistory,
    runtimeSettings,
    runtimeSettingsError,
    runtimeSettingsLoading,
    lastRuntimeSettingsAt,
    runtimeConfigAuditEvents,
    runtimeConfigAuditError,
    runtimeConfigAuditLoading,
    runtimeSettingPending,
    runtimeSettingResult,
    policySettings,
    policySettingsError,
    policySettingsLoading,
    scene,
    situation,
    briefing,
    monitorStatuses,
    refreshStatus,
    refreshDeployments,
    refreshRuntimeSettings,
    refreshRuntimeConfigAuditEvents,
    refreshPolicySettings,
    writeRuntimeSetting,
    refreshLogs,
    selectMonitor,
    replaceLogs,
    appendLog,
    setFollowingLogs,
    runControl,
  };
});

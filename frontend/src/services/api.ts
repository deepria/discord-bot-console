import type {
  BotStatus,
  ConsoleActor,
  ConsoleAuthStatus,
  ControlAction,
  DeploymentRecord,
  DeploymentsResponse,
  LogsResponse,
  RuntimeEvent,
  RuntimeConfigAuditEvent,
  RuntimeConfigAuditResponse,
  RuntimeSetting,
  RuntimeSettingKind,
  RuntimeSettingsResponse,
  RuntimeSettingWriteResult,
  PolicySetting,
  PolicySettingsResponse,
  PersistentOperationRecord,
  RuntimeStatus,
  TraceRecord,
  TracesResponse,
  UsageResponse,
  MemoryResponse,
  MemoryDetailResponse,
  MemoryEvaluationResponse,
} from "../types/api";
import {
  PRESENCE_STATUSES,
  PRESENCE_ACTIVITIES,
  PRESENCE_MODES,
  PRESENCE_OPERATIONS,
  presenceTextError,
  type PresenceConfiguration,
  type PresenceSnapshot,
} from "../domain/presence";
import { MEMORY_EVALUATION_REASONS } from "../domain/memoryEvaluation";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseRuntime(value: unknown): RuntimeStatus | null {
  if (!isRecord(value)) return null;
  return {
    provider: nullableString(value.provider),
    model: nullableString(value.model),
    guild_count: nullableNumber(value.guild_count),
    latency_ms: nullableNumber(value.latency_ms),
  };
}

function parseEvents(value: unknown): RuntimeEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    ...item,
    at: nullableString(item.at),
    event: nullableString(item.event),
  }));
}

function parseStatus(value: unknown): BotStatus {
  if (!isRecord(value) || typeof value.online !== "boolean") {
    throw new ApiError("Status response is missing the online field.");
  }
  return {
    online: value.online,
    pid: nullableNumber(value.pid),
    memory_mb: nullableNumber(value.memory_mb),
    cpu_percent: nullableNumber(value.cpu_percent),
    uptime_seconds: nullableNumber(value.uptime_seconds),
    runtime: parseRuntime(value.runtime),
    events: parseEvents(value.events),
    events_error: nullableString(value.events_error),
  };
}

function parseLogs(value: unknown): LogsResponse {
  if (!isRecord(value) || !Array.isArray(value.logs)) {
    throw new ApiError("Logs response is invalid.");
  }
  return {
    logs: value.logs.filter((line): line is string => typeof line === "string"),
  };
}

function parseTrace(value: unknown): TraceRecord | null {
  if (!isRecord(value)) return null;
  return {
    at: nullableString(value.at) ?? undefined,
    turn_id: nullableString(value.turn_id) ?? undefined,
    event: nullableString(value.event) ?? undefined,
    operation: nullableString(value.operation) ?? undefined,
    status: nullableString(value.status) ?? undefined,
    provider: nullableString(value.provider) ?? undefined,
    model: nullableString(value.model) ?? undefined,
    routing: isRecord(value.routing)
      ? {
          web: value.routing.web === true,
          tier: nullableString(value.routing.tier) ?? undefined,
        }
      : undefined,
    latency_ms: nullableNumber(value.latency_ms) ?? undefined,
    tokens: isRecord(value.tokens)
      ? {
          input: nullableNumber(value.tokens.input) ?? undefined,
          output: nullableNumber(value.tokens.output) ?? undefined,
          total: nullableNumber(value.tokens.total) ?? undefined,
        }
      : undefined,
    web_search_calls: nullableNumber(value.web_search_calls) ?? undefined,
    memory_lifecycle: nullableString(value.memory_lifecycle) ?? undefined,
    error_type: nullableString(value.error_type),
  };
}

function parseTraces(value: unknown): TracesResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.source) ||
    !Array.isArray(value.traces)
  )
    throw new ApiError("Trace response is invalid.");
  if (
    !["HEALTHY", "STALE", "UNAVAILABLE"].includes(
      String(value.source_status),
    ) ||
    !["HEALTHY", "STALE", "UNAVAILABLE"].includes(String(value.source.status))
  )
    throw new ApiError("Trace source state is invalid.");
  const traces = value.traces.map(parseTrace);
  if (traces.some((trace) => trace === null))
    throw new ApiError("Trace response contains an invalid row.");
  return {
    source_status: value.source_status as TracesResponse["source_status"],
    source: {
      status: value.source.status as TracesResponse["source"]["status"],
      last_success_at: nullableTimestamp(value.source.last_success_at),
      error_code: nullableString(value.source.error_code),
    },
    traces: traces as TraceRecord[],
    next_cursor: nullableString(value.next_cursor),
  };
}

function parseTraceDetail(value: unknown): TraceRecord[] {
  if (!isRecord(value) || !Array.isArray(value.trace)) {
    throw new ApiError("Trace detail response is invalid.");
  }
  const traces = value.trace.map(parseTrace);
  if (traces.some((trace) => trace === null)) {
    throw new ApiError("Trace detail response contains an invalid row.");
  }
  return traces as TraceRecord[];
}

function parseUsage(value: unknown): UsageResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.source) ||
    !Array.isArray(value.groups) ||
    (value.group_by !== "provider" && value.group_by !== "model")
  )
    throw new ApiError("Usage response is invalid.");
  if (
    !["HEALTHY", "STALE", "UNAVAILABLE"].includes(String(value.source_status))
  )
    throw new ApiError("Usage source state is invalid.");
  const groups = value.groups.map((group) => {
    if (!isRecord(group))
      throw new ApiError("Usage response contains an invalid group.");
    const calls = nullableNumber(group.calls);
    const errors = nullableNumber(group.errors);
    const totalTokens = nullableNumber(group.total_tokens);
    const successRate = nullableNumber(group.success_rate);
    if (
      calls === null ||
      errors === null ||
      totalTokens === null ||
      successRate === null
    )
      throw new ApiError("Usage response contains an invalid group.");
    return {
      provider: nullableString(group.provider) ?? undefined,
      model: nullableString(group.model) ?? undefined,
      calls,
      errors,
      total_tokens: totalTokens,
      success_rate: successRate,
      p50_latency_ms: nullableNumber(group.p50_latency_ms),
      p95_latency_ms: nullableNumber(group.p95_latency_ms),
    };
  });
  return {
    source_status: value.source_status as UsageResponse["source_status"],
    source: {
      status: value.source.status as UsageResponse["source"]["status"],
      last_success_at: nullableTimestamp(value.source.last_success_at),
      error_code: nullableString(value.source.error_code),
    },
    group_by: value.group_by,
    groups,
  };
}

function parseConsoleActor(value: unknown): ConsoleActor | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  if (value.role !== "admin" && value.role !== "viewer") return null;
  return { id: value.id, role: value.role };
}

function parseConsoleAuthStatus(value: unknown): ConsoleAuthStatus {
  if (!isRecord(value) || typeof value.oauth_enabled !== "boolean") {
    throw new ApiError("Authentication status response is invalid.");
  }
  if (value.actor !== null && parseConsoleActor(value.actor) === null) {
    throw new ApiError(
      "Authentication status response contains an invalid actor.",
    );
  }
  return {
    oauth_enabled: value.oauth_enabled,
    actor: parseConsoleActor(value.actor),
  };
}

function nullableTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // SQLite CURRENT_TIMESTAMP is UTC, even though its text has no timezone suffix.
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(
    value,
  )
    ? value.replace(" ", "T") + "Z"
    : value;
  return Number.isNaN(Date.parse(normalized)) ? null : normalized;
}

function parseDeploymentCheck(
  value: unknown,
): DeploymentRecord["checks"][number] | null {
  if (!isRecord(value) || typeof value.name !== "string") return null;
  if (
    value.status !== "passed" &&
    value.status !== "failed" &&
    value.status !== "skipped" &&
    value.status !== "unknown"
  ) {
    return null;
  }
  const at = nullableTimestamp(value.at);
  if (at === null) return null;
  return {
    name: value.name,
    status: value.status,
    at,
    detail: nullableString(value.detail),
  };
}

function parseDeployment(value: unknown): DeploymentRecord | undefined {
  if (
    !isRecord(value) ||
    value.schema_version !== 1 ||
    typeof value.deployment_id !== "string" ||
    typeof value.component !== "string" ||
    typeof value.phase !== "string" ||
    !Array.isArray(value.checks) ||
    !["queued", "running", "succeeded", "failed", "stale", "unknown"].includes(
      String(value.status),
    )
  ) {
    return undefined;
  }
  const checks = value.checks.map(parseDeploymentCheck);
  if (checks.some((check) => check === null)) return undefined;
  return {
    schema_version: 1,
    deployment_id: value.deployment_id,
    component: value.component,
    target_revision: nullableString(value.target_revision),
    running_revision: nullableString(value.running_revision),
    status: value.status as DeploymentRecord["status"],
    phase: value.phase,
    started_at: nullableTimestamp(value.started_at),
    finished_at: nullableTimestamp(value.finished_at),
    verified_at: nullableTimestamp(value.verified_at),
    checks: checks as DeploymentRecord["checks"],
    previous_revision: nullableString(value.previous_revision),
    log_ref: nullableString(value.log_ref),
    error: nullableString(value.error),
  };
}

function parseDeployments(value: unknown): DeploymentsResponse {
  if (!isRecord(value)) throw new ApiError("Deployments response is invalid.");
  return {
    console: parseDeployment(value.console),
    deployments: Array.isArray(value.deployments)
      ? value.deployments
          .map(parseDeployment)
          .filter((item): item is DeploymentRecord => Boolean(item))
      : [],
  };
}

function parsePersistentOperation(
  value: unknown,
): PersistentOperationRecord | null {
  if (
    !isRecord(value) ||
    typeof value.operation_id !== "string" ||
    typeof value.kind !== "string" ||
    typeof value.actor_kind !== "string" ||
    typeof value.actor_id !== "string" ||
    typeof value.request_id !== "string" ||
    typeof value.requested_at !== "string" ||
    typeof value.completed_at !== "string" ||
    nullableTimestamp(value.requested_at) === null ||
    nullableTimestamp(value.completed_at) === null ||
    (value.result !== "success" && value.result !== "failure") ||
    (value.post_check !== "healthy" && value.post_check !== "failed") ||
    typeof value.service_state !== "string"
  ) {
    return null;
  }
  return {
    operation_id: value.operation_id,
    kind: value.kind,
    actor_kind: value.actor_kind,
    actor_id: value.actor_id,
    request_id: value.request_id,
    requested_at: value.requested_at,
    completed_at: value.completed_at,
    result: value.result,
    post_check: value.post_check,
    service_state: value.service_state,
    error: nullableString(value.error),
  };
}

function parseOperations(value: unknown): {
  operations: PersistentOperationRecord[];
} {
  if (!isRecord(value) || !Array.isArray(value.operations)) {
    throw new ApiError("Operations response is invalid.");
  }
  const operations = value.operations.map(parsePersistentOperation);
  if (operations.some((operation) => operation === null)) {
    throw new ApiError("Operations response contains an invalid operation.");
  }
  return { operations: operations as PersistentOperationRecord[] };
}

function parseRuntimeSetting(value: unknown): RuntimeSetting | null {
  if (!isRecord(value)) return null;
  const kind = nullableString(value.kind) as RuntimeSettingKind | null;
  const source = nullableString(value.source);
  const rawValue = value.value;
  const valueIsValid =
    typeof rawValue === "boolean" ||
    typeof rawValue === "number" ||
    typeof rawValue === "string" ||
    (Array.isArray(rawValue) &&
      rawValue.every((item) => typeof item === "string"));
  if (
    !kind ||
    !["bool", "int", "prefixes", "string"].includes(kind) ||
    (source !== "db" && source !== "startup") ||
    !valueIsValid ||
    typeof value.key !== "string" ||
    typeof value.env_name !== "string" ||
    typeof value.display_value !== "string" ||
    typeof value.empty_allowed !== "boolean"
  ) {
    return null;
  }
  return {
    key: value.key,
    env_name: value.env_name,
    value: rawValue,
    display_value: value.display_value,
    source,
    kind,
    minimum: nullableNumber(value.minimum),
    maximum: nullableNumber(value.maximum),
    empty_allowed: value.empty_allowed,
  };
}

function parseRuntimeSettings(value: unknown): RuntimeSettingsResponse {
  if (!isRecord(value) || !Array.isArray(value.settings)) {
    throw new ApiError("Runtime settings response is invalid.");
  }
  const settings = value.settings
    .map(parseRuntimeSetting)
    .filter((item): item is RuntimeSetting => item !== null);
  if (settings.length !== value.settings.length) {
    throw new ApiError(
      "Runtime settings response contains an invalid setting.",
    );
  }
  return { settings };
}

function parsePolicies(value: unknown): PolicySettingsResponse {
  if (!isRecord(value) || !Array.isArray(value.policies))
    throw new ApiError("Policy settings response is invalid.");
  const fields = [
    "scope",
    "memory_override",
    "memory_effective",
    "memory_source",
    "chatlog_override",
    "chatlog_effective",
    "chatlog_source",
    "capture_override",
    "capture_effective",
    "capture_source",
  ] as const;
  const policies = value.policies.map((item) => {
    if (
      !isRecord(item) ||
      !fields.every((field) => typeof item[field] === "string")
    )
      throw new ApiError(
        "Policy settings response contains an invalid policy.",
      );
    return Object.fromEntries(
      fields.map((field) => [field, item[field]]),
    ) as unknown as PolicySetting;
  });
  return { policies };
}

function parseRuntimeSettingWriteResult(
  value: unknown,
): RuntimeSettingWriteResult {
  const setting = parseRuntimeSetting(value);
  if (
    !setting ||
    !isRecord(value) ||
    (value.changed_at !== null && typeof value.changed_at !== "string")
  ) {
    throw new ApiError("Runtime settings write response is invalid.");
  }
  return { ...setting, changed_at: value.changed_at as string | null };
}

function parseRuntimeConfigAuditEvent(
  value: unknown,
): RuntimeConfigAuditEvent | null {
  if (!isRecord(value)) return null;
  const actorKind = nullableString(value.actor_kind);
  const action = nullableString(value.action);
  const outcome = nullableString(value.outcome);
  if (
    typeof value.id !== "string" ||
    typeof value.occurred_at !== "string" ||
    typeof value.actor_id !== "string" ||
    typeof value.target !== "string" ||
    !["console", "discord", "system"].includes(actorKind ?? "") ||
    !["runtime_config.set", "runtime_config.reset"].includes(action ?? "") ||
    !["success", "failure"].includes(outcome ?? "") ||
    (value.request_id !== null && typeof value.request_id !== "string")
  ) {
    return null;
  }
  return {
    id: value.id,
    occurred_at: value.occurred_at,
    actor_kind: actorKind as RuntimeConfigAuditEvent["actor_kind"],
    actor_id: value.actor_id,
    action: action as RuntimeConfigAuditEvent["action"],
    target: value.target,
    outcome: outcome as RuntimeConfigAuditEvent["outcome"],
    request_id: value.request_id,
  };
}

function parseRuntimeConfigAudit(value: unknown): RuntimeConfigAuditResponse {
  if (!isRecord(value) || !Array.isArray(value.events)) {
    throw new ApiError("Runtime audit response is invalid.");
  }
  const events = value.events
    .map(parseRuntimeConfigAuditEvent)
    .filter((item): item is RuntimeConfigAuditEvent => item !== null);
  if (events.length !== value.events.length) {
    throw new ApiError("Runtime audit response contains an invalid event.");
  }
  return { events };
}

function parsePresenceConfiguration(value: unknown): PresenceConfiguration {
  if (
    !isRecord(value) ||
    !PRESENCE_MODES.includes(value.mode as PresenceConfiguration["mode"]) ||
    !PRESENCE_STATUSES.includes(
      value.status as PresenceConfiguration["status"],
    ) ||
    !PRESENCE_ACTIVITIES.includes(
      value.activity_type as PresenceConfiguration["activity_type"],
    ) ||
    typeof value.activity_text !== "string" ||
    presenceTextError(value.activity_text, 128)
  ) {
    throw new ApiError("Presence configuration response is invalid.");
  }
  return {
    mode: value.mode as PresenceConfiguration["mode"],
    status: value.status as PresenceConfiguration["status"],
    activity_type:
      value.activity_type as PresenceConfiguration["activity_type"],
    activity_text: value.activity_text,
  };
}

function parsePresence(value: unknown): PresenceSnapshot {
  if (
    !isRecord(value) ||
    typeof value.connected !== "boolean" ||
    !["pending", "sent", "unknown", "unavailable"].includes(
      String(value.apply_state),
    ) ||
    !isRecord(value.capabilities) ||
    !Array.isArray(value.capabilities.statuses) ||
    !value.capabilities.statuses.every((item) =>
      PRESENCE_STATUSES.includes(item),
    ) ||
    !Array.isArray(value.capabilities.activity_types) ||
    !value.capabilities.activity_types.every((item) =>
      PRESENCE_ACTIVITIES.includes(item),
    ) ||
    !Number.isInteger(value.capabilities.text_max_length) ||
    Number(value.capabilities.text_max_length) < 1 ||
    Number(value.capabilities.text_max_length) > 128 ||
    !Array.isArray(value.audit)
  ) {
    throw new ApiError("Presence response is invalid.");
  }
  const operation = value.operation;
  if (
    operation !== null &&
    (!isRecord(operation) ||
      typeof operation.request_id !== "string" ||
      !PRESENCE_OPERATIONS.includes(
        operation.state as NonNullable<PresenceSnapshot["operation"]>["state"],
      ) ||
      (operation.error !== null && typeof operation.error !== "string"))
  ) {
    throw new ApiError("Presence operation response is invalid.");
  }
  const audit = value.audit.map((item) => {
    if (
      !isRecord(item) ||
      ![
        "request_id",
        "actor_kind",
        "actor_id",
        "action",
        "outcome",
        "occurred_at",
      ].every((key) => typeof item[key] === "string") ||
      !nullableTimestamp(item.occurred_at)
    ) {
      throw new ApiError("Presence audit response is invalid.");
    }
    return {
      request_id: String(item.request_id),
      actor_kind: String(item.actor_kind),
      actor_id: String(item.actor_id),
      action: String(item.action),
      outcome: String(item.outcome),
      occurred_at: String(item.occurred_at),
    };
  });
  return {
    configured: parsePresenceConfiguration(value.configured),
    manual: parsePresenceConfiguration(value.manual),
    last_sent:
      value.last_sent === null
        ? null
        : parsePresenceConfiguration(value.last_sent),
    last_sent_at: nullableTimestamp(value.last_sent_at),
    connected: value.connected,
    apply_state: value.apply_state as PresenceSnapshot["apply_state"],
    operation: isRecord(operation)
      ? {
          request_id: String(operation.request_id),
          state: operation.state as NonNullable<
            PresenceSnapshot["operation"]
          >["state"],
          error: nullableString(operation.error),
          completed_at: nullableTimestamp(operation.completed_at),
        }
      : null,
    capabilities: {
      statuses: value.capabilities.statuses,
      activity_types: value.capabilities.activity_types,
      text_max_length: Number(value.capabilities.text_max_length),
    },
    audit,
  };
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, { cache: "no-store", ...init });
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? error.message : "Network request failed.",
    );
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    let message = detail;
    try {
      const body: unknown = JSON.parse(detail);
      if (isRecord(body) && typeof body.detail === "string")
        message = body.detail;
      else if (isRecord(body) && Array.isArray(body.detail))
        message = "입력값이 올바르지 않습니다. 형식과 길이를 확인해 주세요.";
    } catch {
      /* Non-JSON upstream errors retain the existing bounded message. */
    }
    throw new ApiError(
      message || `Request failed with HTTP ${response.status}.`,
      response.status,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new ApiError("Server returned invalid JSON.", response.status);
  }
}

function parseMemoryEvaluation(value: unknown): MemoryEvaluationResponse {
  const invalid = () =>
    new ApiError("Memory 평가 응답 형식이 올바르지 않습니다.");
  if (
    !isRecord(value) ||
    !isRecord(value.source) ||
    !isRecord(value.evaluation)
  )
    throw invalid();
  const report = value.evaluation;
  if (
    !isRecord(report.items) ||
    !isRecord(report.provenance) ||
    !isRecord(report.observation) ||
    !isRecord(report.readiness)
  )
    throw invalid();
  const count = (input: unknown, minimum = 0): number => {
    if (
      typeof input !== "number" ||
      !Number.isSafeInteger(input) ||
      input < minimum
    )
      throw invalid();
    return input;
  };
  const timestamp = (input: unknown): string => {
    if (typeof input !== "string" || !Number.isFinite(Date.parse(input)))
      throw invalid();
    return input;
  };
  const optionalTime = (input: unknown) =>
    input === null ? null : timestamp(input);
  const items = {
    total: count(report.items.total),
    active: count(report.items.active),
    superseded: count(report.items.superseded),
    deleted: count(report.items.deleted),
    other_status: count(report.items.other_status),
  };
  const provenance = {
    active_message_linked: count(report.provenance.active_message_linked),
    active_turn_linked: count(report.provenance.active_turn_linked),
  };
  const observation = {
    first_item_at: optionalTime(report.observation.first_item_at),
    last_item_at: optionalTime(report.observation.last_item_at),
    elapsed_days: count(report.observation.elapsed_days),
  };
  const readiness = {
    minimum_active_items: count(report.readiness.minimum_active_items, 1),
    minimum_days: count(report.readiness.minimum_days, 1),
    ready_for_metadata_review: report.readiness.ready_for_metadata_review,
    reasons: report.readiness.reasons,
  };
  if (
    !["HEALTHY", "UNAVAILABLE"].includes(String(report.source_status)) ||
    !["HEALTHY", "STALE", "UNAVAILABLE"].includes(
      String(value.source.status),
    ) ||
    typeof readiness.ready_for_metadata_review !== "boolean" ||
    !Array.isArray(readiness.reasons) ||
    !readiness.reasons.every(
      (reason) =>
        typeof reason === "string" &&
        Object.hasOwn(MEMORY_EVALUATION_REASONS, reason),
    ) ||
    items.total !==
      items.active + items.superseded + items.deleted + items.other_status ||
    provenance.active_message_linked > items.active ||
    provenance.active_turn_linked > items.active ||
    (readiness.ready_for_metadata_review &&
      (report.source_status !== "HEALTHY" ||
        readiness.reasons.length > 0 ||
        items.other_status > 0 ||
        items.active < readiness.minimum_active_items ||
        observation.elapsed_days < readiness.minimum_days ||
        provenance.active_message_linked !== items.active ||
        provenance.active_turn_linked !== items.active ||
        observation.first_item_at === null ||
        observation.last_item_at === null))
  )
    throw invalid();
  return {
    checked_at: timestamp(value.checked_at),
    source: {
      status: value.source
        .status as MemoryEvaluationResponse["source"]["status"],
      last_success_at: optionalTime(value.source.last_success_at),
      error_code: nullableString(value.source.error_code),
    },
    evaluation: {
      source_status: report.source_status as "HEALTHY" | "UNAVAILABLE",
      items,
      provenance,
      observation,
      readiness: {
        ...readiness,
        ready_for_metadata_review: readiness.ready_for_metadata_review,
        reasons: readiness.reasons as string[],
      },
    },
  };
}

function parseMemoryDetail(value: unknown): MemoryDetailResponse {
  const invalid = () => new ApiError("기억 상세 응답을 확인할 수 없습니다.");
  if (!isRecord(value) || !isRecord(value.memory) || !isRecord(value.source))
    throw invalid();
  const item = value.memory;
  const text = (input: unknown): string => {
    if (typeof input !== "string" || !input.trim()) throw invalid();
    return input;
  };
  if (
    !Number.isSafeInteger(item.id) ||
    (item.id as number) < 1 ||
    !["HEALTHY", "STALE", "UNAVAILABLE"].includes(
      String(value.source_status),
    ) ||
    !["HEALTHY", "STALE", "UNAVAILABLE"].includes(
      String(value.source.status),
    ) ||
    typeof item.content !== "string" ||
    !item.content.trim() ||
    Array.from(item.content).length > 600 ||
    typeof item.origin_public_at_capture !== "boolean" ||
    typeof item.confidence !== "number" ||
    !Number.isFinite(item.confidence) ||
    item.confidence < 0 ||
    item.confidence > 1 ||
    item.usage_state !== "shadow_only" ||
    !Array.isArray(item.sources) ||
    item.sources.length > 8 ||
    (item.superseded_by !== null &&
      (!Number.isSafeInteger(item.superseded_by) ||
        (item.superseded_by as number) < 1))
  )
    throw invalid();
  const sources = item.sources.map((source: unknown) => {
    if (
      !isRecord(source) ||
      (source.turn_id !== null && typeof source.turn_id !== "string")
    )
      throw invalid();
    const messageId = text(source.message_id);
    const guild = text(item.origin_realm).match(/^guild:(\d+)$/)?.[1];
    const channel = text(item.origin_channel_id);
    const expected =
      guild && /^\d+$/.test(channel) && /^\d+$/.test(messageId)
        ? `https://discord.com/channels/${guild}/${channel}/${messageId}`
        : null;
    if (
      source.message_url !== null &&
      (typeof source.message_url !== "string" ||
        source.message_url !== expected)
    )
      throw invalid();
    return {
      message_id: messageId,
      turn_id: nullableString(source.turn_id),
      message_url: source.message_url as string | null,
    };
  });
  return {
    source_status: value.source_status as MemoryDetailResponse["source_status"],
    source: {
      status: value.source.status as MemoryDetailResponse["source_status"],
      last_success_at: nullableTimestamp(value.source.last_success_at),
      error_code: nullableString(value.source.error_code),
    },
    memory: {
      id: item.id as number,
      owner_id: text(item.owner_id),
      owner_type: text(item.owner_type),
      content: item.content,
      kind: text(item.kind),
      disclosure: text(item.disclosure),
      confidence: item.confidence,
      origin_realm: text(item.origin_realm),
      origin_channel_id: text(item.origin_channel_id),
      origin_public_at_capture: item.origin_public_at_capture,
      status: text(item.status),
      superseded_by: item.superseded_by as number | null,
      created_at: nullableTimestamp(item.created_at),
      updated_at: nullableTimestamp(item.updated_at),
      usage_state: "shadow_only",
      sources,
    },
  };
}

export const api = {
  async getPresence(requestId?: string): Promise<PresenceSnapshot> {
    return parsePresence(
      await requestJson(
        "/api/bot/presence" +
          (requestId ? `?request_id=${encodeURIComponent(requestId)}` : ""),
      ),
    );
  },
  async setPresence(
    value: PresenceConfiguration,
    requestId: string,
  ): Promise<PresenceSnapshot> {
    return parsePresence(
      await requestJson("/api/bot/presence", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...value, request_id: requestId }),
      }),
    );
  },
  async getMemory(): Promise<MemoryResponse> {
    const result = (await requestJson(
      "/api/memory?limit=50",
    )) as MemoryResponse;
    return {
      ...result,
      memory: result.memory.map((item) => ({
        ...item,
        created_at: nullableTimestamp(item.created_at) ?? item.created_at,
      })),
    };
  },
  async getMemoryDetail(itemId: number): Promise<MemoryDetailResponse> {
    const result = parseMemoryDetail(
      await requestJson(`/api/memory/${itemId}?include_content=true`),
    );
    if (result.memory.id !== itemId)
      throw new ApiError("요청한 기억과 상세 결과가 일치하지 않습니다.");
    return result;
  },
  async getMemoryEvaluation(): Promise<MemoryEvaluationResponse> {
    return parseMemoryEvaluation(await requestJson("/api/memory/evaluation"));
  },
  async getAuthStatus(): Promise<ConsoleAuthStatus> {
    return parseConsoleAuthStatus(await requestJson("/api/auth/me"));
  },
  async logout(): Promise<void> {
    let response: Response;
    try {
      response = await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
      });
    } catch (error) {
      throw new ApiError(
        error instanceof Error ? error.message : "Logout request failed.",
      );
    }
    if (!response.ok) {
      throw new ApiError(
        `Logout failed with HTTP ${response.status}.`,
        response.status,
      );
    }
  },
  async getStatus(): Promise<BotStatus> {
    return parseStatus(await requestJson("/api/status"));
  },
  async getLogs(lines = 100): Promise<LogsResponse> {
    return parseLogs(
      await requestJson(`/api/logs?lines=${Math.max(1, Math.min(lines, 500))}`),
    );
  },
  async getTraces(limit = 50): Promise<TracesResponse> {
    return parseTraces(
      await requestJson(
        `/api/traces?limit=${Math.max(1, Math.min(limit, 100))}`,
      ),
    );
  },
  async getTrace(turnId: string): Promise<TraceRecord[]> {
    return parseTraceDetail(
      await requestJson(`/api/traces/${encodeURIComponent(turnId)}`),
    );
  },
  async getUsage(
    windowHours = 24,
    groupBy: "provider" | "model" = "provider",
  ): Promise<UsageResponse> {
    return parseUsage(
      await requestJson(
        `/api/analytics/usage?window_hours=${Math.max(1, Math.min(windowHours, 744))}&group_by=${groupBy}`,
      ),
    );
  },
  async getDeployments(): Promise<DeploymentsResponse> {
    return parseDeployments(await requestJson("/api/deployments"));
  },
  async getOperations(): Promise<{ operations: PersistentOperationRecord[] }> {
    return parseOperations(await requestJson("/api/operations?limit=50"));
  },
  async getRuntimeSettings(): Promise<RuntimeSettingsResponse> {
    return parseRuntimeSettings(await requestJson("/api/settings/runtime"));
  },
  async getPolicySettings(): Promise<PolicySettingsResponse> {
    return parsePolicies(await requestJson("/api/settings/policies"));
  },
  async setPolicySetting(
    policy: string,
    scope: string,
    value: string,
  ): Promise<void> {
    await requestJson(
      `/api/settings/policies/${encodeURIComponent(policy)}/${scope}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value, request_id: crypto.randomUUID() }),
      },
    );
  },
  async setRuntimeSetting(
    key: string,
    value: string,
    requestId: string,
  ): Promise<RuntimeSettingWriteResult> {
    return parseRuntimeSettingWriteResult(
      await requestJson(`/api/settings/runtime/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value, request_id: requestId }),
      }),
    );
  },
  async resetRuntimeSetting(
    key: string,
    requestId: string,
  ): Promise<RuntimeSettingWriteResult> {
    return parseRuntimeSettingWriteResult(
      await requestJson(`/api/settings/runtime/${encodeURIComponent(key)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId }),
      }),
    );
  },
  async getRuntimeConfigAuditEvents(): Promise<RuntimeConfigAuditResponse> {
    return parseRuntimeConfigAudit(
      await requestJson("/api/settings/audit-events?limit=50"),
    );
  },
  async control(action: ControlAction): Promise<unknown> {
    return requestJson(`/api/bot/${action}`, { method: "POST" });
  },
};

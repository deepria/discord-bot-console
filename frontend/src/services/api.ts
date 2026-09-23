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
} from "../types/api";

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
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return value;
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
    throw new ApiError(
      detail || `Request failed with HTTP ${response.status}.`,
      response.status,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new ApiError("Server returned invalid JSON.", response.status);
  }
}

export const api = {
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

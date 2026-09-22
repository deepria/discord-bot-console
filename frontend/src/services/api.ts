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
  RuntimeStatus,
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

function parseDeployment(value: unknown): DeploymentRecord | undefined {
  return isRecord(value) ? (value as DeploymentRecord) : undefined;
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
  async getDeployments(): Promise<DeploymentsResponse> {
    return parseDeployments(await requestJson("/api/deployments"));
  },
  async getRuntimeSettings(): Promise<RuntimeSettingsResponse> {
    return parseRuntimeSettings(await requestJson("/api/settings/runtime"));
  },
  async getPolicySettings(): Promise<PolicySettingsResponse> {
    return parsePolicies(await requestJson("/api/settings/policies"));
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

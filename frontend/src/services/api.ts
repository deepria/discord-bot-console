import type {
  BotStatus,
  ControlAction,
  DeploymentRecord,
  DeploymentsResponse,
  LogsResponse,
  RuntimeEvent,
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
  async control(action: ControlAction): Promise<unknown> {
    return requestJson(`/api/bot/${action}`, { method: "POST" });
  },
};

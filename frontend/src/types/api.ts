export type SceneState = "loading" | "healthy" | "alert";
export type MonitorId =
  "system" | "link" | "runtime" | "events" | "logs" | "deploy" | "control";
export type MonitorSeverity = "normal" | "attention" | "alert";
export type ControlAction = "start" | "restart" | "stop";
export type RequestState = "idle" | "requesting" | "success" | "failure";
export type LogConnectionState =
  "connecting" | "open" | "reconnecting" | "closed";

export interface RuntimeStatus {
  provider: string | null;
  model: string | null;
  guild_count: number | null;
  latency_ms: number | null;
}

export interface RuntimeEvent {
  at: string | null;
  event: string | null;
  [key: string]: unknown;
}

export interface BotStatus {
  online: boolean;
  pid: number | null;
  memory_mb: number | null;
  cpu_percent: number | null;
  uptime_seconds: number | null;
  runtime: RuntimeStatus | null;
  events: RuntimeEvent[];
  events_error: string | null;
}

export interface LogsResponse {
  logs: string[];
}

export interface DeploymentRecord {
  component?: string;
  available?: boolean;
  detail?: string;
  revision?: string;
  state?: string;
  at?: string;
  last_success_at?: string;
  update_available?: boolean;
  working_tree_dirty?: boolean;
  service?: Record<string, unknown>;
  timer?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DeploymentsResponse {
  console?: DeploymentRecord;
  deployments: DeploymentRecord[];
}

export type RuntimeSettingKind = "bool" | "int" | "prefixes" | "string";
export type RuntimeSettingSource = "db" | "startup";

export interface RuntimeSetting {
  key: string;
  env_name: string;
  value: boolean | number | string | string[];
  display_value: string;
  source: RuntimeSettingSource;
  kind: RuntimeSettingKind;
  minimum: number | null;
  maximum: number | null;
  empty_allowed: boolean;
}

export interface RuntimeSettingsResponse {
  settings: RuntimeSetting[];
}

export type RuntimeConfigAuditActor = "console" | "discord" | "system";
export type RuntimeConfigAuditAction =
  "runtime_config.set" | "runtime_config.reset";
export type RuntimeConfigAuditOutcome = "success" | "failure";

export interface RuntimeConfigAuditEvent {
  id: string;
  occurred_at: string;
  actor_kind: RuntimeConfigAuditActor;
  actor_id: string;
  action: RuntimeConfigAuditAction;
  target: string;
  outcome: RuntimeConfigAuditOutcome;
  request_id: string | null;
}

export interface RuntimeConfigAuditResponse {
  events: RuntimeConfigAuditEvent[];
}

export interface MonitorStatus {
  id: MonitorId;
  label: string;
  severity: MonitorSeverity;
  summary: string;
  badge?: number;
}

export interface ControlResult {
  action: ControlAction;
  state: RequestState;
  message: string;
}

export type PostCheckState = "idle" | "pending" | "healthy" | "failed";

export interface OperationRecord {
  id: string;
  kind: ControlAction;
  requestedAt: string;
  result: Exclude<RequestState, "idle" | "requesting">;
  postCheck: Exclude<PostCheckState, "idle">;
  relatedMonitor: "control";
}

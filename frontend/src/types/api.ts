export type SceneState = "loading" | "healthy" | "alert";
export type MonitorId =
  | "system"
  | "link"
  | "runtime"
  | "events"
  | "logs"
  | "traces"
  | "deploy"
  | "control";
export type MonitorSeverity = "normal" | "attention" | "alert";
export type ControlAction = "start" | "restart" | "stop";
export type ConsoleActorRole = "admin" | "viewer";
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

export type SourceStatus = "HEALTHY" | "STALE" | "UNAVAILABLE";

export interface TraceRecord {
  at?: string;
  turn_id?: string;
  event?: string;
  operation?: string;
  status?: string;
  provider?: string;
  model?: string;
  routing?: { web?: boolean; tier?: string };
  latency_ms?: number;
  tokens?: { input?: number; output?: number; total?: number };
  web_search_calls?: number;
  memory_lifecycle?: string;
  error_type?: string | null;
}

export interface TracesResponse {
  source_status: SourceStatus;
  source: {
    status: SourceStatus;
    last_success_at: string | null;
    error_code: string | null;
  };
  traces: TraceRecord[];
  next_cursor: string | null;
}

export interface ConsoleActor {
  id: string;
  role: ConsoleActorRole;
}

export interface ConsoleAuthStatus {
  oauth_enabled: boolean;
  actor: ConsoleActor | null;
}

export type DeploymentStatus =
  "queued" | "running" | "succeeded" | "failed" | "stale" | "unknown";

export interface DeploymentCheck {
  name: string;
  status: "passed" | "failed" | "skipped" | "unknown";
  at: string;
  detail: string | null;
}

export interface DeploymentRecord {
  schema_version: 1;
  deployment_id: string;
  component: string;
  target_revision: string | null;
  running_revision: string | null;
  status: DeploymentStatus;
  phase: string;
  started_at: string | null;
  finished_at: string | null;
  verified_at: string | null;
  checks: DeploymentCheck[];
  previous_revision: string | null;
  log_ref: string | null;
  error: string | null;
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

export interface PolicySetting {
  scope: string;
  memory_override: string;
  memory_effective: string;
  memory_source: string;
  chatlog_override: string;
  chatlog_effective: string;
  chatlog_source: string;
  capture_override: string;
  capture_effective: string;
  capture_source: string;
}

export interface PolicySettingsResponse {
  policies: PolicySetting[];
}

export interface RuntimeSettingWriteResult {
  key: string;
  env_name: string;
  value: RuntimeSetting["value"];
  display_value: string;
  source: RuntimeSettingSource;
  changed_at: string | null;
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

export interface PersistentOperationRecord {
  operation_id: string;
  kind: string;
  actor_kind: string;
  actor_id: string;
  request_id: string;
  requested_at: string;
  completed_at: string;
  result: "success" | "failure";
  post_check: "healthy" | "failed";
  service_state: string;
  error: string | null;
}

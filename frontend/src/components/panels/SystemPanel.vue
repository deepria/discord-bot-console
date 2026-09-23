<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import { formatKst, formatUptime } from "../../utils/format";
import TelemetryValue from "../common/TelemetryValue.vue";
import StatusBadge from "../common/StatusBadge.vue";

const store = useOperationsStore();
const { status, stale, statusError, lastStatusAt } = storeToRefs(store);

function linkSeverity(): "normal" | "alert" {
  return statusError.value || stale.value ? "alert" : "normal";
}

function runtimeSeverity(): "normal" | "attention" {
  return (status.value?.runtime?.latency_ms ?? 0) > 500
    ? "attention"
    : "normal";
}
</script>

<template>
  <div class="panel-content unified-status-content">
    <p v-if="statusError" class="inline-alert">{{ statusError }}</p>
    <section class="unified-status-summary" aria-label="전체 상태 요약">
      <StatusBadge
        :label="
          !status
            ? 'STATUS UNAVAILABLE'
            : stale
              ? 'STATUS STALE'
              : status.online
                ? 'ALL SYSTEMS NOMINAL'
                : 'BOT OFFLINE'
        "
        :severity="!status || stale || !status.online ? 'alert' : 'normal'"
      />
      <p>LAST VERIFIED / {{ formatKst(lastStatusAt) }}</p>
    </section>
    <section class="unified-status-grid" aria-label="통합 서비스 상태">
      <article class="unified-status-card">
        <header>
          <span>SYSTEM STATUS</span>
          <StatusBadge
            :label="
              !status
                ? 'UNAVAILABLE'
                : stale
                  ? 'STALE'
                  : status.online
                    ? 'ONLINE'
                    : 'OFFLINE'
            "
            :severity="!status || stale || !status.online ? 'alert' : 'normal'"
          />
        </header>
        <div class="telemetry-grid">
          <TelemetryValue label="PID" :value="status?.pid" />
          <TelemetryValue
            label="UPTIME"
            :value="formatUptime(status?.uptime_seconds)"
          />
          <TelemetryValue label="MEMORY" :value="status?.memory_mb" unit="MB" />
          <TelemetryValue label="CPU" :value="status?.cpu_percent" unit="%" />
        </div>
      </article>
      <article class="unified-status-card">
        <header>
          <span>DISCORD / AI</span>
          <StatusBadge
            :label="
              status?.runtime?.latency_ms == null
                ? 'NO DATA'
                : `${status.runtime.latency_ms} MS`
            "
            :severity="runtimeSeverity()"
          />
        </header>
        <div class="telemetry-grid">
          <TelemetryValue label="PROVIDER" :value="status?.runtime?.provider" />
          <TelemetryValue label="MODEL" :value="status?.runtime?.model" />
          <TelemetryValue
            label="GUILDS"
            :value="status?.runtime?.guild_count"
          />
          <TelemetryValue
            label="LATENCY"
            :value="status?.runtime?.latency_ms"
            unit="MS"
          />
        </div>
        <p class="panel-footnote">LATENCY ATTENTION THRESHOLD / 500 MS</p>
      </article>
      <article class="unified-status-card">
        <header>
          <span>DATA LINK</span>
          <StatusBadge
            :label="statusError || stale ? 'DEGRADED' : 'CONNECTED'"
            :severity="linkSeverity()"
          />
        </header>
        <dl class="data-list">
          <div>
            <dt>ROUTE</dt>
            <dd>CT-101 → Agent → Console</dd>
          </div>
          <div>
            <dt>LAST RESPONSE</dt>
            <dd>{{ formatKst(lastStatusAt) }}</dd>
          </div>
          <div>
            <dt>STATUS API</dt>
            <dd>
              {{
                statusError ?? (stale ? "Last known state retained" : "Nominal")
              }}
            </dd>
          </div>
          <div>
            <dt>EVENT API</dt>
            <dd>{{ status?.events_error ?? "Nominal" }}</dd>
          </div>
        </dl>
      </article>
    </section>
    <section class="unified-flow" aria-label="서비스 연동 흐름">
      <span>DATA LINK</span><i aria-hidden="true">→</i><span>AI PROCESSING</span
      ><i aria-hidden="true">→</i><span>DISCORD DELIVERY</span>
      <small>각 단계의 상태는 위 카드와 마지막 응답 시각에서 확인합니다.</small>
    </section>
    <p class="panel-footnote">
      하나의 통합 화면에서 상태를 확인하고, 상세 이벤트·로그·제어는 기존 운영
      패널에서 이어서 확인합니다.
    </p>
  </div>
</template>

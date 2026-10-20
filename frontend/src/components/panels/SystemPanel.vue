<script setup lang="ts">
import { computed, ref } from "vue";
import { recentTurnErrors } from "../../domain/recentErrors";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import { formatKst, formatUptime } from "../../utils/format";
import TelemetryValue from "../common/TelemetryValue.vue";
import StatusBadge from "../common/StatusBadge.vue";
import { STATUS_LABELS, ACTIVITY_LABELS } from "../../domain/presence";

import BotControlActions from "../command/BotControlActions.vue";
defineProps<{ canManage?: boolean }>();
const store = useOperationsStore();
const refreshResult = ref("");
async function retryStatus(): Promise<void> {
  if (store.statusInFlight) return;
  refreshResult.value = "";
  await store.refreshStatus();
  refreshResult.value =
    store.statusError || store.status?.events_error
      ? "일부 상태를 조회하지 못했습니다. 오류 안내를 확인해 주세요."
      : "최신 상태를 다시 조회했습니다.";
}
const { status, stale, statusError, lastStatusAt } = storeToRefs(store);
const { presence, presenceError } = storeToRefs(store);

const recentErrors = computed(() =>
  recentTurnErrors(status.value?.events ?? []),
);
const errorsUnavailable = computed(
  () => !status.value || Boolean(status.value.events_error),
);

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
    <p v-if="presence?.last_sent" class="panel-footnote">
      DISCORD PRESENCE / {{ STATUS_LABELS[presence.last_sent.status] }} /
      {{ ACTIVITY_LABELS[presence.last_sent.activity_type] }}
      {{ presence.last_sent.activity_text }} /
      {{
        presenceError
          ? "STALE"
          : presence.connected && presence.apply_state === "sent"
            ? "LAST SENT"
            : "현재 적용 확인 불가"
      }}
      · SETTINGS에서 관리
    </p>
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
    <section class="unified-status-card" aria-label="상태 조회 및 복구">
      <header>
        <span>STATUS / RECOVERY</span>
        <button
          type="button"
          class="control-button"
          :disabled="store.statusInFlight"
          @click="retryStatus"
        >
          {{ store.statusInFlight ? "상태 조회 중…" : "상태 다시 조회" }}
        </button>
      </header>
      <p v-if="refreshResult" role="status" class="panel-footnote">
        {{ refreshResult }}
      </p>
      <p class="panel-footnote">
        상태 조회는 정보를 다시 읽습니다. Bot 재시작 중에는 Discord 응답이 잠시
        중단됩니다. 실행 후 봇 서비스 상태를 확인하며, Discord 연결 복구는
        별도로 확인해 주세요.
      </p>
      <BotControlActions :can-manage="canManage" :actions="['restart']" />
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
    <section
      class="unified-status-card recent-errors"
      aria-label="최근 응답 오류"
    >
      <header>
        <span>RECENT ERRORS / {{ recentErrors.length }}</span>
        <button
          type="button"
          class="control-button"
          @click="store.selectMonitor('events')"
        >
          Live Events 보기
        </button>
      </header>
      <p class="panel-footnote">
        최근 수신 이벤트 {{ status?.events.length ?? 0 }}건 중 응답 실패 최대
        5건입니다. 전체 오류 이력이나 현재 장애 여부를 뜻하지 않습니다.
      </p>
      <p v-if="errorsUnavailable" class="inline-alert">
        오류 이벤트를 확인할 수 없습니다. {{ status?.events_error }}
      </p>
      <p v-else-if="stale || statusError" class="inline-alert">
        최신 오류 여부를 확인할 수 없습니다. 마지막 수신 결과를 표시합니다.
      </p>
      <ol v-if="recentErrors.length" class="recent-error-list">
        <li v-for="(error, index) in recentErrors" :key="index">
          <time :datetime="error.at ?? undefined">{{
            error.at ? formatKst(error.at) : "시각 미상"
          }}</time>
          <strong>{{ error.diagnosis }}</strong>
        </li>
      </ol>
      <p
        v-else-if="!errorsUnavailable && !stale && !statusError"
        class="panel-footnote"
      >
        최근 수신 범위에 응답 오류가 없습니다.
      </p>
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

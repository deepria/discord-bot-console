<script setup lang="ts">
import { computed } from "vue";
import type { Situation } from "../../domain/situation";
import type {
  BotStatus,
  ConsoleActor,
  MonitorId,
  MonitorStatus,
} from "../../types/api";
import { formatKst, formatUptime } from "../../utils/format";
import ActionCard from "../command/ActionCard.vue";
import StatusBadge from "../common/StatusBadge.vue";

const props = defineProps<{
  monitors: Record<MonitorId, MonitorStatus>;
  situation: Situation;
  status: BotStatus | null;
  lastStatusAt: Date | null;
  authActor: ConsoleActor | null;
  oauthEnabled: boolean;
}>();

const emit = defineEmits<{
  select: [id: MonitorId];
  office: [];
  settings: [];
  logout: [];
}>();

const monitorItems = computed(() => {
  const priority = { alert: 0, attention: 1, normal: 2 } as const;
  return Object.values(props.monitors)
    .filter((monitor) => monitor.id !== "link" && monitor.id !== "runtime")
    .sort((left, right) => priority[left.severity] - priority[right.severity]);
});

const statusLabel = computed(() => {
  if (!props.status) return "UNAVAILABLE";
  return props.status.online ? "ONLINE" : "OFFLINE";
});

function inspectSituation(): void {
  if (props.situation.recommendedMonitor) {
    emit("select", props.situation.recommendedMonitor);
  }
}
</script>

<template>
  <section class="console-mode" aria-label="Rio Command Deck 콘솔 모드">
    <header class="console-header">
      <div class="console-brand">
        <span>RIO COMMAND DECK</span>
        <strong>OPERATIONS CONSOLE / CT-101</strong>
      </div>
      <div class="console-header-actions">
        <StatusBadge
          :label="statusLabel"
          :severity="monitors.system.severity"
        />
        <button type="button" class="mode-switch" @click="$emit('office')">
          OFFICE MODE
        </button>
        <button type="button" class="mode-switch" @click="$emit('settings')">
          SETTINGS
        </button>
        <a
          v-if="oauthEnabled && !authActor"
          class="mode-switch console-auth-link"
          href="/auth/discord/login"
        >
          DISCORD LOGIN
        </a>
        <template v-else-if="authActor">
          <span class="console-auth-actor">
            DISCORD · {{ authActor.role.toUpperCase() }}
          </span>
          <button type="button" class="mode-switch" @click="$emit('logout')">
            LOG OUT
          </button>
        </template>
      </div>
    </header>

    <main class="console-grid">
      <aside class="console-navigation" aria-label="관제 메뉴">
        <span class="console-kicker">OPERATIONS</span>
        <nav>
          <button
            v-for="monitor in monitorItems"
            :key="monitor.id"
            type="button"
            :class="`severity-${monitor.severity}`"
            :aria-label="`${monitor.label}: ${monitor.summary}`"
            @click="$emit('select', monitor.id)"
          >
            <span>{{ monitor.label }}</span>
            <small>{{ monitor.summary }}</small>
          </button>
        </nav>
        <button
          type="button"
          class="console-settings"
          @click="$emit('settings')"
        >
          <span>RUNTIME SETTINGS</span><small>READ ONLY</small>
        </button>
      </aside>

      <div class="console-content">
        <section class="console-overview">
          <span class="console-kicker">CURRENT SITUATION</span>
          <h1>{{ situation.title }}</h1>
          <p>{{ situation.reason }}</p>
          <small
            >{{ situation.detail }} / LAST VERIFIED
            {{ formatKst(lastStatusAt) }}</small
          >
        </section>

        <ActionCard
          v-if="
            situation.level === 'action-required' ||
            situation.level === 'advisory'
          "
          :situation="situation"
          @inspect="inspectSituation"
          @logs="$emit('select', 'logs')"
        />

        <section class="console-metrics" aria-label="주요 운영 지표">
          <article>
            <span>SERVICE</span>
            <strong>{{ statusLabel }}</strong>
            <small>PID {{ status?.pid ?? "-" }}</small>
          </article>
          <article>
            <span>DISCORD LATENCY</span>
            <strong
              >{{ status?.runtime?.latency_ms ?? "-"
              }}<small> MS</small></strong
            >
            <small>GUILDS {{ status?.runtime?.guild_count ?? "-" }}</small>
          </article>
          <article>
            <span>RESOURCE</span>
            <strong>{{ status?.memory_mb ?? "-" }}<small> MB</small></strong>
            <small>CPU {{ status?.cpu_percent ?? "-" }}%</small>
          </article>
          <article>
            <span>UPTIME</span>
            <strong>{{ formatUptime(status?.uptime_seconds) }}</strong>
            <small
              >{{ status?.runtime?.provider ?? "-" }} /
              {{ status?.runtime?.model ?? "-" }}</small
            >
          </article>
        </section>

        <section class="console-guidance">
          <span class="console-kicker">NEXT STEP</span>
          <p>{{ situation.impact }}</p>
          <button
            v-if="situation.recommendedMonitor"
            type="button"
            @click="inspectSituation"
          >
            {{ monitors[situation.recommendedMonitor].label }} 열기
          </button>
        </section>
      </div>
    </main>
  </section>
</template>

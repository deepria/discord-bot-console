<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import { formatKst } from "../../utils/format";

const emit = defineEmits<{ close: [] }>();
const store = useOperationsStore();
const {
  runtimeSettings,
  runtimeSettingsError,
  runtimeSettingsLoading,
  lastRuntimeSettingsAt,
  runtimeConfigAuditEvents,
  runtimeConfigAuditError,
  runtimeConfigAuditLoading,
} = storeToRefs(store);

function constraint(setting: (typeof runtimeSettings.value)[number]): string {
  if (setting.kind === "bool") return "on/off";
  if (setting.kind === "prefixes") return "쉼표 구분 접두어";
  if (setting.minimum !== null || setting.maximum !== null) {
    return `${setting.minimum ?? "-∞"}–${setting.maximum ?? "∞"}`;
  }
  return setting.empty_allowed ? "비움 가능" : "문자열";
}

onMounted(() => {
  void Promise.all([
    store.refreshRuntimeSettings(),
    store.refreshRuntimeConfigAuditEvents(),
  ]);
});
</script>

<template>
  <aside
    class="monitor-panel settings-panel"
    tabindex="-1"
    aria-labelledby="runtime-settings-title"
    @keydown.esc="emit('close')"
  >
    <header class="monitor-panel-header">
      <div>
        <span>CONFIGURATION / READ ONLY</span>
        <h2 id="runtime-settings-title">RUNTIME SETTINGS</h2>
      </div>
      <button
        type="button"
        class="panel-close"
        aria-label="상세 패널 닫기"
        @click="emit('close')"
      >
        ×
      </button>
    </header>
    <div class="panel-state-line">
      <i aria-hidden="true"></i>
      {{ runtimeSettingsLoading ? "LOADING" : "READ ONLY / AGENT SNAPSHOT" }}
    </div>
    <div class="panel-content stack">
      <p class="panel-footnote">
        Discord `/config`과 같은 runtime override 상태입니다. 편집과 reset은
        아직 Console에 노출하지 않습니다.
      </p>
      <p v-if="runtimeSettingsError" class="inline-alert">
        설정을 읽지 못했습니다. {{ runtimeSettingsError }}
      </p>
      <p
        v-else-if="!runtimeSettings.length && !runtimeSettingsLoading"
        class="panel-footnote"
      >
        표시할 런타임 설정이 없습니다.
      </p>
      <div v-else class="settings-list" aria-label="런타임 설정 목록">
        <article v-for="setting in runtimeSettings" :key="setting.key">
          <div>
            <strong>{{ setting.env_name }}</strong>
            <small>{{ constraint(setting) }}</small>
          </div>
          <output>{{ setting.display_value }}</output>
          <span :class="`source-${setting.source}`">
            {{ setting.source === "db" ? "DB OVERRIDE" : "STARTUP" }}
          </span>
        </article>
      </div>
      <section class="operations-history" aria-labelledby="runtime-audit-title">
        <h3 id="runtime-audit-title">CONFIGURATION CHANGE HISTORY</h3>
        <p v-if="runtimeConfigAuditLoading">감사 이력을 읽는 중입니다.</p>
        <p v-else-if="runtimeConfigAuditError" class="inline-alert">
          감사 이력을 읽지 못했습니다. {{ runtimeConfigAuditError }}
        </p>
        <p v-else-if="!runtimeConfigAuditEvents.length">
          기록된 런타임 설정 변경이 없습니다.
        </p>
        <ol v-else>
          <li v-for="event in runtimeConfigAuditEvents" :key="event.id">
            <strong
              >{{ event.action }} / {{ event.outcome.toUpperCase() }}</strong
            >
            <span
              >{{ event.target }} · {{ event.actor_kind.toUpperCase() }}</span
            >
            <time>{{ formatKst(event.occurred_at) }}</time>
          </li>
        </ol>
        <p>변경 값과 대화 내용은 감사 이력에 저장하지 않습니다.</p>
      </section>
      <p class="panel-footnote">
        LAST SNAPSHOT / {{ formatKst(lastRuntimeSettingsAt) }}
      </p>
    </div>
  </aside>
</template>

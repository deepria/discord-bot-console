<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import type { MonitorId } from "../../types/api";
import ControlPanel from "./ControlPanel.vue";
import DeployPanel from "./DeployPanel.vue";
import EventsPanel from "./EventsPanel.vue";
import LogsPanel from "./LogsPanel.vue";
import SystemPanel from "./SystemPanel.vue";

defineProps<{ inline?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const store = useOperationsStore();
const { selectedMonitor, monitorStatuses } = storeToRefs(store);
const panel = ref<HTMLElement | null>(null);

const components: Record<MonitorId, unknown> = {
  system: SystemPanel,
  link: SystemPanel,
  runtime: SystemPanel,
  events: EventsPanel,
  logs: LogsPanel,
  deploy: DeployPanel,
  control: ControlPanel,
};

const current = computed(() =>
  selectedMonitor.value ? monitorStatuses.value[selectedMonitor.value] : null,
);
const currentComponent = computed(() =>
  selectedMonitor.value ? components[selectedMonitor.value] : null,
);

onMounted(() => panel.value?.focus({ preventScroll: true }));
</script>

<template>
  <aside
    v-if="current && currentComponent"
    id="monitor-panel"
    ref="panel"
    class="monitor-panel"
    :class="{
      'is-wide':
        current.id === 'logs' ||
        current.id === 'events' ||
        current.id === 'system',
      'is-inline': inline,
    }"
    tabindex="-1"
    :aria-labelledby="`panel-title-${current.id}`"
    @keydown.esc="emit('close')"
  >
    <header class="monitor-panel-header">
      <div>
        <span>MONITOR / {{ current.id.toUpperCase() }}</span>
        <h2 :id="`panel-title-${current.id}`">{{ current.label }}</h2>
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
    <div class="panel-state-line" :class="`severity-${current.severity}`">
      <i aria-hidden="true"></i>{{ current.summary }}
    </div>
    <component :is="currentComponent" />
  </aside>
</template>

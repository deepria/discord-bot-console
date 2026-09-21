<script setup lang="ts">
import { nextTick, ref } from "vue";
import { storeToRefs } from "pinia";
import OfficeScene from "../components/scene/OfficeScene.vue";
import MonitorPanel from "../components/panels/MonitorPanel.vue";
import { usePolling } from "../composables/usePolling";
import { useLogStream } from "../composables/useLogStream";
import { useOperationsStore } from "../stores/operations";
import type { MonitorId } from "../types/api";

const store = useOperationsStore();
const { scene, situation, monitorStatuses, selectedMonitor, briefing } =
  storeToRefs(store);
const office = ref<InstanceType<typeof OfficeScene> | null>(null);

usePolling(() => store.refreshStatus(), 5000);
usePolling(() => store.refreshDeployments(), 10000);
useLogStream();

function selectMonitor(id: MonitorId): void {
  if (selectedMonitor.value === id) {
    void closePanel();
    return;
  }
  office.value?.closeDialogue();
  store.selectMonitor(id);
}

function dismissPanel(): void {
  store.selectMonitor(null);
}

function selectLogs(): void {
  selectMonitor("logs");
}

async function closePanel(): Promise<void> {
  const previous = selectedMonitor.value;
  store.selectMonitor(null);
  await nextTick();
  if (previous) office.value?.focusMonitor(previous);
}
</script>

<template>
  <main class="command-deck" :data-scene="scene">
    <OfficeScene
      ref="office"
      :scene="scene"
      :monitors="monitorStatuses"
      :selected="selectedMonitor"
      :message="briefing.message"
      :detail="briefing.detail"
      :situation="situation"
      @select="selectMonitor"
      @select-logs="selectLogs"
      @dismiss-panel="dismissPanel"
    />
    <Transition name="panel-slide">
      <MonitorPanel
        v-if="selectedMonitor"
        :key="selectedMonitor"
        @close="closePanel"
      />
    </Transition>
    <div class="small-status-strip" aria-hidden="true">
      <span
        v-for="monitor in monitorStatuses"
        :key="monitor.id"
        :class="`severity-${monitor.severity}`"
      >
        {{ monitor.id.toUpperCase() }}
      </span>
    </div>
  </main>
</template>

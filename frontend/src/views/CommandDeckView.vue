<script setup lang="ts">
import { nextTick, ref } from "vue";
import { storeToRefs } from "pinia";
import ConsoleMode from "../components/console/ConsoleMode.vue";
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
const mode = ref<"console" | "office">("console");

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

function switchMode(nextMode: "console" | "office"): void {
  if (mode.value === nextMode) return;
  office.value?.closeDialogue();
  store.selectMonitor(null);
  mode.value = nextMode;
}

async function closePanel(): Promise<void> {
  const previous = selectedMonitor.value;
  store.selectMonitor(null);
  await nextTick();
  if (previous) office.value?.focusMonitor(previous);
}
</script>

<template>
  <main
    class="command-deck"
    :class="{ 'is-office-mode': mode === 'office' }"
    :data-scene="scene"
  >
    <Transition name="mode-swap" mode="out-in">
      <ConsoleMode
        v-if="mode === 'console'"
        :monitors="monitorStatuses"
        :situation="situation"
        :status="store.status"
        :last-status-at="store.lastStatusAt"
        @select="selectMonitor"
        @office="switchMode('office')"
      />
      <section v-else class="office-mode-layout">
        <div class="office-visual-stage">
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
            @console="switchMode('console')"
            @dismiss-panel="dismissPanel"
          />
        </div>
        <Transition name="panel-slide">
          <MonitorPanel
            v-if="selectedMonitor"
            :key="selectedMonitor"
            inline
            @close="closePanel"
          />
        </Transition>
      </section>
    </Transition>
    <Transition name="panel-slide">
      <MonitorPanel
        v-if="selectedMonitor && mode === 'console'"
        :key="selectedMonitor"
        @close="closePanel"
      />
    </Transition>
  </main>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import ConsoleMode from "../components/console/ConsoleMode.vue";
import OfficeScene from "../components/scene/OfficeScene.vue";
import MonitorPanel from "../components/panels/MonitorPanel.vue";
import SettingsPanel from "../components/panels/SettingsPanel.vue";
import CommandPalette from "../components/command/CommandPalette.vue";
import { usePolling } from "../composables/usePolling";
import { useLogStream } from "../composables/useLogStream";
import { useOperationsStore } from "../stores/operations";
import type { MonitorId } from "../types/api";

const store = useOperationsStore();
const { scene, situation, monitorStatuses, selectedMonitor, briefing } =
  storeToRefs(store);
const office = ref<InstanceType<typeof OfficeScene> | null>(null);
const mode = ref<"console" | "office">("console");
const paletteOpen = ref(false);
const settingsOpen = ref(false);
let paletteTrigger: HTMLElement | null = null;

usePolling(() => store.refreshStatus(), 5000);
usePolling(() => store.refreshDeployments(), 10000);
useLogStream();

function selectMonitor(id: MonitorId): void {
  settingsOpen.value = false;
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

function openSettings(): void {
  office.value?.closeDialogue();
  store.selectMonitor(null);
  settingsOpen.value = true;
}

function closeSettings(): void {
  settingsOpen.value = false;
}

function selectLogs(): void {
  selectMonitor("logs");
}

function openPalette(): void {
  paletteTrigger =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  paletteOpen.value = true;
}

function closePalette(): void {
  paletteOpen.value = false;
  void nextTick(() => paletteTrigger?.focus());
}

function onGlobalKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (paletteOpen.value) closePalette();
    else openPalette();
  }
}

onMounted(() => window.addEventListener("keydown", onGlobalKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onGlobalKeydown));

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
    <button
      class="palette-trigger"
      type="button"
      aria-label="명령 팔레트 열기"
      @click="openPalette"
    >
      ⌘ K
    </button>
    <Transition name="mode-swap" mode="out-in">
      <ConsoleMode
        v-if="mode === 'console'"
        :monitors="monitorStatuses"
        :situation="situation"
        :status="store.status"
        :last-status-at="store.lastStatusAt"
        @select="selectMonitor"
        @office="switchMode('office')"
        @settings="openSettings"
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
            @settings="openSettings"
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
    <Transition name="panel-slide">
      <SettingsPanel v-if="settingsOpen" @close="closeSettings" />
    </Transition>
    <CommandPalette
      :open="paletteOpen"
      @close="closePalette"
      @select="selectMonitor"
      @settings="openSettings"
    />
  </main>
</template>

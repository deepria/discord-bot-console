<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  rioDialogues,
  rioExpressions,
  type RioDialogue,
} from "../../data/rio-dialogues";
import type { MonitorId, MonitorStatus, SceneState } from "../../types/api";
import MonitorHotspot from "./MonitorHotspot.vue";
import RioBriefing from "./RioBriefing.vue";
import RioCharacter from "./RioCharacter.vue";
import SceneLayers from "./SceneLayers.vue";
import systemTile from "../../assets/monitors/system.webp";
import linkTile from "../../assets/monitors/link.webp";
import runtimeTile from "../../assets/monitors/runtime.webp";
import eventsTile from "../../assets/monitors/events.webp";
import logsTile from "../../assets/monitors/logs.webp";
import deployTile from "../../assets/monitors/deploy.webp";
import controlTile from "../../assets/monitors/control.webp";

const props = defineProps<{
  scene: SceneState;
  monitors: Record<MonitorId, MonitorStatus>;
  selected: MonitorId | null;
  message: string;
  detail: string;
}>();

const emit = defineEmits<{
  select: [id: MonitorId];
  dismissPanel: [];
}>();

const root = ref<HTMLElement | null>(null);
const time = ref("--:--:-- KST");
let clockTimer: number | undefined;
const dialogueOpen = ref(false);
const dialogueIndex = ref(0);

const positions: Record<
  MonitorId,
  { x: number; y: number; width: number; height: number; tile: string }
> = {
  system: { x: 1.5, y: 21.7, width: 6, height: 5.9, tile: systemTile },
  link: { x: 9, y: 21.7, width: 9.6, height: 6.4, tile: linkTile },
  runtime: { x: 19.1, y: 21.7, width: 5.4, height: 6.2, tile: runtimeTile },
  events: { x: 25.7, y: 21.7, width: 8.1, height: 6.2, tile: eventsTile },
  logs: { x: 35.6, y: 21.7, width: 6.9, height: 6.2, tile: logsTile },
  deploy: { x: 43.7, y: 21.7, width: 6.9, height: 6.2, tile: deployTile },
  control: { x: 52, y: 21.7, width: 9.3, height: 5.4, tile: controlTile },
};

const linkLabel = computed(() => props.monitors.link.summary);
const currentDialogue = computed<RioDialogue>(() => {
  if (dialogueIndex.value === 0) {
    return {
      image: rioExpressions[0],
      message: props.message,
      detail: props.detail,
    };
  }
  return rioDialogues[dialogueIndex.value - 1];
});

function updateClock(): void {
  time.value =
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date()) + " KST";
}

function focusMonitor(id: MonitorId): void {
  root.value?.querySelector<HTMLElement>(`[data-monitor="${id}"]`)?.focus();
}

function closeDialogue(): void {
  dialogueOpen.value = false;
}

function advanceDialogue(): void {
  dialogueIndex.value = (dialogueIndex.value + 1) % rioExpressions.length;
}

function interactWithRio(): void {
  if (!dialogueOpen.value) {
    dialogueIndex.value = 0;
    dialogueOpen.value = true;
    emit("dismissPanel");
    return;
  }
  advanceDialogue();
}

function selectMonitor(id: MonitorId): void {
  closeDialogue();
  emit("select", id);
}

function dismissFromBackground(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("button, a, input, select, textarea, [role='dialog']"))
    return;
  closeDialogue();
  emit("dismissPanel");
}

defineExpose({ focusMonitor, closeDialogue });

onMounted(() => {
  updateClock();
  clockTimer = window.setInterval(updateClock, 1000);
});

onUnmounted(() => window.clearInterval(clockTimer));
</script>

<template>
  <section
    ref="root"
    class="office-scene"
    :data-scene="scene"
    aria-label="Rio Operations Room"
  >
    <div class="office-stage" @click="dismissFromBackground">
      <SceneLayers :scene="scene" />
      <div class="scene-shade" aria-hidden="true"></div>
      <header class="scene-hud">
        <div class="hud-block brand-block">
          <span>RIO OFFICE</span>
          <strong>CT-101 BOT / DATA LINK</strong>
        </div>
        <div class="hud-block status-block">
          <span>{{ time }}</span>
          <strong>{{ linkLabel }}</strong>
        </div>
      </header>
      <nav class="monitor-navigation" aria-label="관제 모니터">
        <MonitorHotspot
          v-for="(position, id) in positions"
          :key="id"
          :monitor="monitors[id]"
          :selected="selected === id"
          v-bind="position"
          @select="selectMonitor"
        />
      </nav>
      <RioCharacter
        :scene="scene"
        :expression="currentDialogue.image"
        :dialogue-open="dialogueOpen"
        @interact="interactWithRio"
      />
      <Transition name="rio-dialogue">
        <RioBriefing
          v-if="dialogueOpen"
          :message="currentDialogue.message"
          :detail="currentDialogue.detail"
          @next="advanceDialogue"
          @close="closeDialogue"
        />
      </Transition>
    </div>
  </section>
</template>

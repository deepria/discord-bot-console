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

interface WallTile {
  id: string;
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
  monitor?: MonitorId;
}

const activeMonitors: Partial<Record<string, MonitorId>> = {
  "1-1": "system",
  "1-2": "link",
  "1-3": "runtime",
  "1-4": "events",
  "1-5": "logs",
  "1-6": "deploy",
  "2-1": "control",
};

const columns = [1.2, 17.7, 34.2, 50.7, 67.2, 83.7];
const rows = [
  { y: 21.5, height: 5.85 },
  { y: 28.5, height: 5.21 },
  { y: 33.84, height: 5.32 },
  { y: 39.38, height: 5 },
];

const positions: WallTile[] = rows.flatMap(({ y, height }, rowIndex) =>
  columns.map((x, columnIndex) => {
    const row = rowIndex + 1;
    const column = columnIndex + 1;
    return {
      id: `r${row}-c${column}`,
      row,
      column,
      x,
      y,
      width: 14.95,
      height,
      monitor: activeMonitors[`${row}-${column}`],
    };
  }),
);

function tileSource(tile: WallTile): string {
  const state = props.scene === "alert" ? "alert" : "healthy";
  return `/monitor-tiles/${state}-r${tile.row}-c${tile.column}.webp`;
}

function tileStyle(tile: WallTile): Record<string, string> {
  return {
    left: `${tile.x}%`,
    top: `${tile.y}%`,
    width: `${tile.width}%`,
    height: `${tile.height}%`,
    backgroundImage: `url(${tileSource(tile)})`,
  };
}

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
        <template v-for="position in positions" :key="position.id">
          <MonitorHotspot
            v-if="position.monitor"
            :monitor="monitors[position.monitor]"
            :selected="selected === position.monitor"
            :x="position.x"
            :y="position.y"
            :width="position.width"
            :height="position.height"
            :tile="tileSource(position)"
            @select="selectMonitor"
          />
          <span
            v-else
            class="monitor-tile monitor-tile-disabled"
            :style="tileStyle(position)"
            aria-hidden="true"
          ></span>
        </template>
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

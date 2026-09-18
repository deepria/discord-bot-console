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
  x: number;
  y: number;
  width: number;
  height: number;
  tiltX: number;
  tiltY: number;
  frameShape: string;
  transformOrigin: string;
  monitor: MonitorId;
}

// Coordinates are measured from the outer frames already drawn in the wall art.
// The remaining frames stay purely decorative until a future feature is assigned.
const positions: WallTile[] = [
  {
    id: "system",
    monitor: "system",
    x: 0.96,
    y: 21.49,
    width: 12.38,
    height: 6.7,
    tiltX: -0.7,
    tiltY: 1.4,
    frameShape: "polygon(1% 0, 99% 1%, 100% 99%, 0 100%)",
    transformOrigin: "right center",
  },
  {
    id: "link",
    monitor: "link",
    x: 0.96,
    y: 29.25,
    width: 12.38,
    height: 6.7,
    tiltX: -0.25,
    tiltY: 1.4,
    frameShape: "polygon(0 1%, 100% 0, 99% 100%, 1% 99%)",
    transformOrigin: "right center",
  },
  {
    id: "runtime",
    monitor: "runtime",
    x: 0.96,
    y: 37.24,
    width: 12.38,
    height: 6.7,
    tiltX: 0.15,
    tiltY: 1.4,
    frameShape: "polygon(1% 0, 100% 1%, 99% 100%, 0 99%)",
    transformOrigin: "right center",
  },
  {
    id: "events",
    monitor: "events",
    x: 0.96,
    y: 45.22,
    width: 12.38,
    height: 6.7,
    tiltX: 0.55,
    tiltY: 1.4,
    frameShape: "polygon(0 1%, 99% 0, 100% 99%, 1% 100%)",
    transformOrigin: "right center",
  },
  {
    id: "logs",
    monitor: "logs",
    x: 13.82,
    y: 21.49,
    width: 10.53,
    height: 6.7,
    tiltX: -1,
    tiltY: -3.2,
    frameShape: "polygon(4% 0, 100% 4%, 96% 100%, 0 96%)",
    transformOrigin: "left center",
  },
  {
    id: "deploy",
    monitor: "deploy",
    x: 13.82,
    y: 29.25,
    width: 10.53,
    height: 6.7,
    tiltX: -0.4,
    tiltY: -5.4,
    frameShape: "polygon(7% 0, 100% 8%, 93% 100%, 0 92%)",
    transformOrigin: "left center",
  },
  {
    id: "control",
    monitor: "control",
    x: 13.82,
    y: 37.24,
    width: 10.53,
    height: 6.7,
    tiltX: 0.25,
    tiltY: -4.1,
    frameShape: "polygon(5% 0, 100% 5%, 96% 100%, 0 95%)",
    transformOrigin: "left center",
  },
];

function tileSource(tile: WallTile): string {
  const state = props.scene === "alert" ? "alert" : "healthy";
  return `/monitor-tiles/${state}-${tile.id}.webp`;
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
        <MonitorHotspot
          v-for="position in positions"
          :key="position.id"
          :monitor="monitors[position.monitor]"
          :selected="selected === position.monitor"
          :x="position.x"
          :y="position.y"
          :width="position.width"
          :height="position.height"
          :tilt-x="position.tiltX"
          :tilt-y="position.tiltY"
          :frame-shape="position.frameShape"
          :transform-origin="position.transformOrigin"
          :tile="tileSource(position)"
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

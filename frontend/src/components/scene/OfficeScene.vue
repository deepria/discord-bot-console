<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
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

defineEmits<{ select: [id: MonitorId] }>();

const root = ref<HTMLElement | null>(null);
const time = ref("--:--:-- KST");
let clockTimer: number | undefined;

const positions: Record<
  MonitorId,
  { x: number; y: number; width: number; height: number }
> = {
  system: { x: 3, y: 22, width: 12, height: 18 },
  link: { x: 16.5, y: 22, width: 12, height: 18 },
  runtime: { x: 30, y: 22, width: 12, height: 18 },
  events: { x: 43.5, y: 22, width: 12, height: 18 },
  logs: { x: 57, y: 22, width: 12, height: 18 },
  deploy: { x: 70.5, y: 22, width: 12, height: 18 },
  control: { x: 85, y: 45, width: 12, height: 14 },
};

const linkLabel = computed(() => props.monitors.link.summary);

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

defineExpose({ focusMonitor });

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
    <div class="office-stage">
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
          @select="$emit('select', $event)"
        />
      </nav>
      <RioCharacter :scene="scene" />
      <RioBriefing :message="message" :detail="detail" />
    </div>
  </section>
</template>

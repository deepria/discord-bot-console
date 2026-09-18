<script setup lang="ts">
import { computed } from "vue";
import type { MonitorStatus } from "../../types/api";

const props = defineProps<{
  monitor: MonitorStatus;
  x: number;
  y: number;
  width: number;
  height: number;
  framePoints: string;
}>();

const vertices = computed(() =>
  props.framePoints.split(" ").map((point) => {
    const [relativeX, relativeY] = point.split(",").map(Number);
    return {
      x: props.x + (props.width * relativeX) / 100,
      y: props.y + (props.height * relativeY) / 100,
    };
  }),
);

const framePolygon = computed(() =>
  vertices.value.map(({ x, y }) => `${x},${y}`).join(" "),
);

const anchor = computed(() => ({
  x: (vertices.value[0].x + vertices.value[1].x) / 2,
  y: (vertices.value[0].y + vertices.value[1].y) / 2,
}));

const labelPosition = computed(() => ({
  x: Math.min(Math.max(anchor.value.x + 18, 28), 76),
  y: 10,
}));

const leaderPath = computed(
  () =>
    `M ${anchor.value.x} ${anchor.value.y} L ${labelPosition.value.x - 3} ${labelPosition.value.y} L ${labelPosition.value.x} ${labelPosition.value.y}`,
);

const attention = computed(
  () =>
    Boolean(props.monitor.badge) ||
    props.monitor.severity === "alert" ||
    props.monitor.severity === "attention",
);
</script>

<template>
  <div
    class="monitor-callout"
    :class="{ attention }"
    :style="{
      '--label-x': `${labelPosition.x}%`,
      '--label-y': `${labelPosition.y}%`,
    }"
    aria-hidden="true"
  >
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      <polygon :points="framePolygon" pathLength="1" />
      <path :d="leaderPath" pathLength="1" />
    </svg>
    <div class="monitor-callout-label">
      <strong>{{ monitor.label }}</strong>
      <span>{{ monitor.summary }}</span>
      <small>CLICK TO OPEN</small>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MonitorStatus } from "../../types/api";

const props = defineProps<{
  monitor: MonitorStatus;
  selected: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  tile: string;
  tiltX: number;
  tiltY: number;
  frameShape: string;
  transformOrigin: string;
}>();

defineEmits<{ select: [id: MonitorStatus["id"]] }>();
</script>

<template>
  <button
    type="button"
    class="monitor-hotspot"
    :class="[
      `severity-${monitor.severity}`,
      { selected, 'has-badge': Boolean(monitor.badge) },
    ]"
    :style="{
      left: `${x}%`,
      top: `${y}%`,
      width: `${width}%`,
      height: `${height}%`,
      backgroundImage: `url(${tile})`,
      '--tile-tilt-x': `${tiltX}deg`,
      '--tile-tilt-y': `${tiltY}deg`,
      '--tile-origin': transformOrigin,
      clipPath: frameShape,
    }"
    :data-monitor="monitor.id"
    :aria-label="`${monitor.label}: ${monitor.summary}`"
    :aria-expanded="selected"
    aria-controls="monitor-panel"
    @click="$emit('select', props.monitor.id)"
  >
    <span class="monitor-tooltip" role="presentation">
      <span class="monitor-label" :data-short="monitor.id.toUpperCase()">{{
        monitor.label
      }}</span>
      <span class="monitor-summary">{{ monitor.summary }}</span>
      <span class="monitor-action">CLICK TO OPEN</span>
    </span>
  </button>
</template>

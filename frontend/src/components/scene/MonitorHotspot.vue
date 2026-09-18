<script setup lang="ts">
import type { MonitorStatus } from "../../types/api";

const props = defineProps<{
  monitor: MonitorStatus;
  selected: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}>();

defineEmits<{ select: [id: MonitorStatus["id"]] }>();
</script>

<template>
  <button
    type="button"
    class="monitor-hotspot"
    :class="[`severity-${monitor.severity}`, { selected }]"
    :style="{
      left: `${x}%`,
      top: `${y}%`,
      width: `${width}%`,
      height: `${height}%`,
    }"
    :data-monitor="monitor.id"
    :aria-label="`${monitor.label}: ${monitor.summary}`"
    :aria-expanded="selected"
    aria-controls="monitor-panel"
    @click="$emit('select', props.monitor.id)"
  >
    <span class="monitor-label" :data-short="monitor.id.toUpperCase()">{{
      monitor.label
    }}</span>
    <span class="monitor-summary">{{ monitor.summary }}</span>
    <b
      v-if="monitor.badge"
      class="monitor-badge"
      :aria-label="`${monitor.badge}개 새 항목`"
      >{{ monitor.badge }}</b
    >
  </button>
</template>

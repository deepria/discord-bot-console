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

defineEmits<{
  select: [id: MonitorStatus["id"]];
  hover: [id: MonitorStatus["id"]];
  leave: [];
}>();
</script>

<template>
  <button
    type="button"
    class="monitor-hotspot"
    :class="{ selected }"
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
    @pointerenter="$emit('hover', props.monitor.id)"
    @pointerleave="$emit('leave')"
    @focus="$emit('hover', props.monitor.id)"
    @blur="$emit('leave')"
  ></button>
</template>

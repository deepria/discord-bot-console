<script setup lang="ts">
import type { MonitorSeverity } from "../../types/api";

defineProps<{ label: string; severity?: MonitorSeverity }>();
</script>

<template>
  <span class="status-badge" :class="`is-${severity ?? 'normal'}`">
    <i aria-hidden="true"></i>{{ label }}
  </span>
</template>

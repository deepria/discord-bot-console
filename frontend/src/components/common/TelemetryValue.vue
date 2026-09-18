<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  label: string;
  value: string | number | null | undefined;
  unit?: string;
}>();
const changed = ref(false);
let timer: number | undefined;

watch(
  () => props.value,
  (value, previous) => {
    if (previous === undefined || value === previous) return;
    changed.value = false;
    window.clearTimeout(timer);
    requestAnimationFrame(() => {
      changed.value = true;
      timer = window.setTimeout(() => (changed.value = false), 480);
    });
  },
);
</script>

<template>
  <div class="telemetry-value" :class="{ 'is-changed': changed }">
    <span>{{ label }}</span>
    <strong
      >{{ value ?? "-" }}<small v-if="unit"> {{ unit }}</small></strong
    >
  </div>
</template>

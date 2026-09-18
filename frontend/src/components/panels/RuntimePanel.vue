<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import TelemetryValue from "../common/TelemetryValue.vue";

const store = useOperationsStore();
const { status } = storeToRefs(store);
</script>

<template>
  <div class="panel-content">
    <div class="telemetry-grid">
      <TelemetryValue label="PROVIDER" :value="status?.runtime?.provider" />
      <TelemetryValue label="MODEL" :value="status?.runtime?.model" />
      <TelemetryValue label="GUILDS" :value="status?.runtime?.guild_count" />
      <TelemetryValue
        label="DISCORD LATENCY"
        :value="status?.runtime?.latency_ms"
        unit="MS"
      />
    </div>
    <p class="panel-footnote">LATENCY ATTENTION THRESHOLD / 500 MS</p>
  </div>
</template>

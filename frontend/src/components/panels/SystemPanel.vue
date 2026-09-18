<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import { formatKst, formatUptime } from "../../utils/format";
import TelemetryValue from "../common/TelemetryValue.vue";

const store = useOperationsStore();
const { status, stale, statusError, lastStatusAt } = storeToRefs(store);
</script>

<template>
  <div class="panel-content">
    <p v-if="statusError" class="inline-alert">{{ statusError }}</p>
    <div class="telemetry-grid">
      <TelemetryValue
        label="STATUS"
        :value="
          !status
            ? 'UNAVAILABLE'
            : stale
              ? 'STALE'
              : status.online
                ? 'ONLINE'
                : 'OFFLINE'
        "
      />
      <TelemetryValue label="PID" :value="status?.pid" />
      <TelemetryValue
        label="UPTIME"
        :value="formatUptime(status?.uptime_seconds)"
      />
      <TelemetryValue label="MEMORY" :value="status?.memory_mb" unit="MB" />
      <TelemetryValue label="CPU" :value="status?.cpu_percent" unit="%" />
    </div>
    <p class="panel-footnote">
      LAST GOOD RESPONSE / {{ formatKst(lastStatusAt) }}
    </p>
  </div>
</template>

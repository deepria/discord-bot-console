<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import { formatKst } from "../../utils/format";
import StatusBadge from "../common/StatusBadge.vue";

const store = useOperationsStore();
const { status, statusError, stale, lastStatusAt } = storeToRefs(store);
</script>

<template>
  <div class="panel-content stack">
    <StatusBadge
      :label="statusError || stale ? 'LINK DEGRADED' : 'AGENT LINK CONNECTED'"
      :severity="statusError || stale ? 'alert' : 'normal'"
    />
    <dl class="data-list">
      <div>
        <dt>ROUTE</dt>
        <dd>CT-101 → Agent → Console</dd>
      </div>
      <div>
        <dt>LAST RESPONSE</dt>
        <dd>{{ formatKst(lastStatusAt) }}</dd>
      </div>
      <div>
        <dt>STATUS API</dt>
        <dd>
          {{ statusError ?? (stale ? "Last known state retained" : "Nominal") }}
        </dd>
      </div>
      <div>
        <dt>EVENT API</dt>
        <dd>{{ status?.events_error ?? "Nominal" }}</dd>
      </div>
    </dl>
  </div>
</template>

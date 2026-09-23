<script setup lang="ts">
import { onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import { formatKst } from "../../utils/format";
const store = useOperationsStore();
const { usage, usageError, usageLoading } = storeToRefs(store);
const windowHours = ref(24);
const groupBy = ref<"provider" | "model">("provider");
onMounted(() => void store.refreshUsage(windowHours.value, groupBy.value));
function refresh(): void {
  void store.refreshUsage(windowHours.value, groupBy.value);
}
function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
</script>
<template>
  <div class="panel-content stack usage-panel">
    <div class="usage-controls">
      <label
        >PERIOD
        <select v-model.number="windowHours" @change="refresh">
          <option :value="24">24 HOURS</option>
          <option :value="168">7 DAYS</option>
          <option :value="744">31 DAYS</option>
        </select></label
      ><label
        >GROUP
        <select v-model="groupBy" @change="refresh">
          <option value="provider">PROVIDER</option>
          <option value="model">MODEL</option>
        </select></label
      ><button type="button" @click="refresh">REFRESH</button>
    </div>
    <p
      v-if="usageError || usage?.source_status === 'UNAVAILABLE'"
      class="inline-alert"
    >
      {{ usageError ?? "Usage source is unavailable." }}
    </p>
    <p v-else-if="usage?.source_status === 'STALE'" class="inline-alert">
      Usage data is stale. Last update:
      {{ formatKst(usage.source.last_success_at) }}
    </p>
    <p v-if="usageLoading" class="empty-state">
      USAGE METADATA를 불러오는 중입니다.
    </p>
    <ol v-else-if="usage?.groups.length" class="trace-list">
      <li
        v-for="(group, index) in usage.groups"
        :key="`${group.provider ?? group.model}-${index}`"
      >
        <header>
          <strong>{{ group.provider ?? group.model ?? "UNKNOWN" }}</strong
          ><time>{{ group.calls }} CALLS</time>
        </header>
        <dl class="data-list compact">
          <div>
            <dt>SUCCESS RATE</dt>
            <dd>{{ percent(group.success_rate) }}</dd>
          </div>
          <div>
            <dt>ERRORS</dt>
            <dd>{{ group.errors }}</dd>
          </div>
          <div>
            <dt>TOKENS</dt>
            <dd>{{ group.total_tokens }}</dd>
          </div>
          <div>
            <dt>P50 LATENCY</dt>
            <dd>{{ group.p50_latency_ms ?? "-" }} ms</dd>
          </div>
          <div>
            <dt>P95 LATENCY</dt>
            <dd>{{ group.p95_latency_ms ?? "-" }} ms</dd>
          </div>
        </dl>
      </li>
    </ol>
    <p v-else-if="!usageLoading && !usageError" class="empty-state">
      선택한 기간에 usage 데이터가 없습니다.
    </p>
    <p class="panel-footnote">
      AGGREGATED CONTENT-FREE METADATA ONLY / SOURCE
      {{ usage?.source_status ?? "UNKNOWN" }}
    </p>
  </div>
</template>

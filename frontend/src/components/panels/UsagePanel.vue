<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import TelemetryCoverage from "./TelemetryCoverage.vue";
import { formatKst } from "../../utils/format";
const props = defineProps<{ workspace?: boolean }>();
const route = props.workspace ? useRoute() : undefined;
const router = props.workspace ? useRouter() : undefined;
const store = useOperationsStore();
const { usage, usageError, usageLoading } = storeToRefs(store);
function filterHours(value: unknown): number {
  return value === "168"
    ? 168
    : value === "720"
      ? 720
      : value === "2160"
        ? 2160
        : 24;
}
const windowHours = ref(
  props.workspace ? filterHours(route?.query?.hours) : 24,
);
const groupBy = ref<"provider" | "model">(
  props.workspace && route?.query?.group === "model" ? "model" : "provider",
);
onMounted(() => void store.refreshUsage(windowHours.value, groupBy.value));
function refresh(): void {
  void store.refreshUsage(windowHours.value, groupBy.value);
}
watch(
  () => [route?.query?.hours, route?.query?.group],
  ([hours, group]) => {
    if (!props.workspace || route?.query?.view !== "usage") return;
    const nextHours = filterHours(hours);
    const nextGroup = group === "model" ? "model" : "provider";
    if (nextHours === windowHours.value && nextGroup === groupBy.value) return;
    windowHours.value = nextHours;
    groupBy.value = nextGroup;
    refresh();
  },
);

function changeFilters() {
  if (props.workspace) {
    void router?.replace({
      query: {
        ...route?.query,
        hours: String(windowHours.value),
        group: groupBy.value,
      },
    });
  }
  refresh();
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
        <select v-model.number="windowHours" @change="changeFilters">
          <option :value="24">24 HOURS</option>
          <option :value="168">7 DAYS</option>
          <option :value="720">30 DAYS</option>
          <option :value="2160">90 DAYS</option>
        </select></label
      ><label
        >GROUP
        <select v-model="groupBy" @change="changeFilters">
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
    <TelemetryCoverage :coverage="usage?.coverage" />
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
            <dd>
              {{ group.total_tokens
              }}<span v-if="group.unknown_token_calls">
                · token 미확인 {{ group.unknown_token_calls }}건</span
              >
            </dd>
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

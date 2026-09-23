<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import { api } from "../../services/api";
import type { TraceRecord } from "../../types/api";
import { formatKst } from "../../utils/format";

const store = useOperationsStore();
const { traces, tracesError, tracesLoading } = storeToRefs(store);
const rows = computed(() => traces.value?.traces ?? []);
const selectedTurnId = ref<string | null>(null);
const detail = ref<TraceRecord[]>([]);
const detailError = ref<string | null>(null);

onMounted(() => void store.refreshTraces());

function label(value: unknown): string {
  return value == null || value === "" ? "-" : String(value);
}

async function inspect(turnId: string | undefined): Promise<void> {
  if (!turnId) return;
  selectedTurnId.value = turnId;
  detailError.value = null;
  try {
    detail.value = await api.getTrace(turnId);
  } catch (error) {
    detailError.value =
      error instanceof Error ? error.message : "Trace detail request failed.";
  }
}
</script>

<template>
  <div class="panel-content stack trace-panel">
    <p v-if="tracesError" class="inline-alert">{{ tracesError }}</p>
    <p v-else-if="traces?.source_status === 'UNAVAILABLE'" class="inline-alert">
      Trace source is unavailable. No prior data is shown as current.
    </p>
    <p v-else-if="traces?.source_status === 'STALE'" class="inline-alert">
      Trace data is stale. Last source update:
      {{ formatKst(traces.source.last_success_at) }}
    </p>
    <p v-if="tracesLoading" class="empty-state">
      TRACE METADATA를 불러오는 중입니다.
    </p>
    <ol v-else-if="rows.length" class="trace-list">
      <li
        v-for="(trace, index) in rows"
        :key="`${trace.turn_id}-${trace.event}-${trace.at}-${index}`"
      >
        <header>
          <button
            type="button"
            :class="{ 'is-selected': selectedTurnId === trace.turn_id }"
            :disabled="!trace.turn_id"
            @click="inspect(trace.turn_id)"
          >
            {{ label(trace.event).toUpperCase() }}
          </button>
          <time>{{ formatKst(trace.at) }}</time>
        </header>
        <dl class="data-list compact">
          <div>
            <dt>TURN ID</dt>
            <dd>{{ label(trace.turn_id) }}</dd>
          </div>
          <div>
            <dt>STATUS</dt>
            <dd>{{ label(trace.status) }}</dd>
          </div>
          <div>
            <dt>PROVIDER / MODEL</dt>
            <dd>{{ label(trace.provider) }} / {{ label(trace.model) }}</dd>
          </div>
          <div>
            <dt>ROUTING</dt>
            <dd>
              {{ trace.routing?.tier ?? "-" }} / WEB
              {{ trace.routing?.web ? "ON" : "OFF" }}
            </dd>
          </div>
          <div>
            <dt>LATENCY</dt>
            <dd>{{ trace.latency_ms ?? "-" }} ms</dd>
          </div>
          <div>
            <dt>TOKENS</dt>
            <dd>{{ trace.tokens?.total ?? "-" }} total</dd>
          </div>
          <div>
            <dt>WEB SEARCH</dt>
            <dd>{{ trace.web_search_calls ?? "-" }}</dd>
          </div>
          <div>
            <dt>MEMORY</dt>
            <dd>{{ label(trace.memory_lifecycle) }}</dd>
          </div>
          <div v-if="trace.error_type">
            <dt>ERROR</dt>
            <dd>{{ trace.error_type }}</dd>
          </div>
        </dl>
      </li>
    </ol>
    <section
      v-if="selectedTurnId"
      class="trace-detail"
      aria-label="선택한 turn 상세"
    >
      <p class="panel-kicker">SELECTED TURN / {{ selectedTurnId }}</p>
      <p v-if="detailError" class="inline-alert">{{ detailError }}</p>
      <p v-else>
        {{ detail.length }} EVENTS / 전체 content-free metadata를 조회했습니다.
      </p>
    </section>
    <p v-else-if="!tracesError" class="empty-state">
      현재 기간에 표시할 turn trace가 없습니다.
    </p>
    <p class="panel-footnote">
      CONTENT-FREE METADATA ONLY / SOURCE
      {{ traces?.source_status ?? "UNKNOWN" }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import TelemetryCoverage from "./TelemetryCoverage.vue";
import { api } from "../../services/api";
import type { TraceRecord } from "../../types/api";
import { formatKst } from "../../utils/format";

const props = defineProps<{ workspace?: boolean }>();
const route = props.workspace ? useRoute() : undefined;
const router = props.workspace ? useRouter() : undefined;
const store = useOperationsStore();
const { traces, tracesError, tracesLoading } = storeToRefs(store);
const rows = computed(() => traces.value?.traces ?? []);
const selectedTurnId = ref<string | null>(null);
const detail = ref<TraceRecord[]>([]);
const detailError = ref<string | null>(null);

function period(value: unknown) {
  return value === "24" ? 24 : value === "168" ? 168 : 720;
}

const detailRegion = ref<HTMLElement | null>(null);
const traceResults = ref<HTMLElement | null>(null);
const traceWorkspace = ref<HTMLElement | null>(null);
let detailTrigger: HTMLElement | null = null;
let returnToList: { hours: number; scrollTop: number; pageTop: number } | null =
  null;
const windowHours = ref(props.workspace ? period(route?.query?.hours) : 720);
const queryTo = ref(new Date().toISOString());
let detailRequest = 0;
onMounted(() => {
  refresh();
  if (props.workspace && typeof route?.query?.turn === "string")
    void inspect(route?.query?.turn);
});

watch(
  () => route?.query?.hours,
  (value) => {
    if (!props.workspace || windowHours.value === period(value)) return;
    windowHours.value = period(value);
    refresh();
  },
);

watch(
  () => route?.query?.turn,
  (value, previous) => {
    if (!props.workspace) return;
    if (typeof value === "string") {
      void inspect(value);
    } else {
      detailRequest += 1;
      selectedTurnId.value = null;
      const position = returnToList;
      returnToList = null;
      if (previous)
        void nextTick(() => {
          if (position && traceWorkspace.value) {
            traceWorkspace.value.scrollTop = position.scrollTop;
            window.scrollTo(0, position.pageTop);
          }
          if (detailTrigger?.isConnected)
            detailTrigger.focus({ preventScroll: true });
          else traceResults.value?.focus({ preventScroll: true });
        });
    }
  },
);

function changePeriod() {
  if (props.workspace) {
    void router?.replace({
      query: { ...route?.query, hours: String(windowHours.value) },
    });
  }
  refresh();
}
function chooseTrace(turnId: string | undefined, event: MouseEvent) {
  if (!turnId) return;
  if (props.workspace) {
    detailTrigger =
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const destination = { query: { ...route?.query, turn: turnId } };
    if (selectedTurnId.value) {
      void router?.replace(destination);
    } else {
      returnToList = {
        hours: windowHours.value,
        scrollTop: traceWorkspace.value?.scrollTop ?? 0,
        pageTop: window.scrollY,
      };
      void router?.push(destination);
    }
  } else {
    void inspect(turnId);
  }
}
function closeTrace() {
  if (returnToList?.hours === windowHours.value) {
    router?.back();
    return;
  }
  const query = { ...route?.query };
  delete query.turn;
  void router?.replace({ query });
}
function refresh(): void {
  if (!props.workspace) detailRequest += 1;
  queryTo.value = new Date().toISOString();
  if (!props.workspace) {
    selectedTurnId.value = null;
    detail.value = [];
    detailError.value = null;
  }
  void store.refreshTraces(windowHours.value, undefined, queryTo.value);
}
function more(): void {
  if (traces.value?.next_cursor) {
    void store.refreshTraces(
      windowHours.value,
      traces.value.next_cursor,
      queryTo.value,
    );
  }
}

function label(value: unknown): string {
  return value == null || value === "" ? "-" : String(value);
}

async function inspect(turnId: string | undefined): Promise<void> {
  if (!turnId || !/^[A-Za-z0-9_-]{1,100}$/.test(turnId)) return;
  const request = ++detailRequest;
  selectedTurnId.value = turnId;
  if (props.workspace) {
    await nextTick();
    detailRegion.value?.focus({ preventScroll: true });
  }
  detail.value = [];
  detailError.value = null;
  try {
    const result = await api.getTrace(turnId);
    if (request === detailRequest) detail.value = result;
  } catch (error) {
    if (request !== detailRequest) return;
    detailError.value =
      error instanceof Error ? error.message : "Trace detail request failed.";
  }
}
</script>

<template>
  <div
    ref="traceWorkspace"
    class="panel-content stack trace-panel"
    :class="{ 'trace-workspace': workspace }"
  >
    <div
      ref="traceResults"
      class="trace-results"
      tabindex="-1"
      aria-label="Trace 결과"
    >
      <div class="usage-controls">
        <label
          >PERIOD
          <select v-model.number="windowHours" @change="changePeriod">
            <option :value="24">24 HOURS</option>
            <option :value="168">7 DAYS</option>
            <option :value="720">30 DAYS</option>
          </select></label
        >
        <button type="button" @click="refresh">REFRESH</button>
      </div>
      <TelemetryCoverage :coverage="traces?.coverage" />
      <p v-if="tracesError" class="inline-alert">{{ tracesError }}</p>
      <p
        v-else-if="traces?.source_status === 'UNAVAILABLE'"
        class="inline-alert"
      >
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
              @click="chooseTrace(trace.turn_id, $event)"
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
      <button
        v-if="traces?.next_cursor"
        type="button"
        :disabled="tracesLoading"
        @click="more"
      >
        다음 기록
      </button>
      <p
        v-if="!selectedTurnId && !tracesError && !tracesLoading && !rows.length"
        class="empty-state"
      >
        현재 기간에 표시할 turn trace가 없습니다.
      </p>
      <p class="panel-footnote">
        CONTENT-FREE METADATA ONLY / SOURCE
        {{ traces?.source_status ?? "UNKNOWN" }}
      </p>
    </div>
    <section
      v-if="selectedTurnId"
      ref="detailRegion"
      class="trace-detail"
      aria-label="선택한 turn 상세"
      tabindex="-1"
      @keydown.esc.stop="workspace && closeTrace()"
    >
      <header>
        <h3>Trace 상세</h3>
        <button v-if="workspace" type="button" @click="closeTrace">
          Trace 닫기
        </button>
      </header>
      <code>{{ selectedTurnId }}</code>
      <p v-if="detailError" class="inline-alert">{{ detailError }}</p>
      <p v-else-if="!detail.length" role="status">표시할 이벤트가 없습니다.</p>
      <ol v-else class="trace-list">
        <li v-for="(item, index) in detail" :key="index">
          <strong>{{ label(item.event) }}</strong>
          <time>{{ formatKst(item.at) }}</time>
          <div>
            {{ label(item.status) }} · {{ label(item.provider) }} /
            {{ label(item.model) }}
          </div>
          <div v-if="item.error_type">{{ item.error_type }}</div>
          <div v-if="item.latency_ms != null">{{ item.latency_ms }} ms</div>
        </li>
      </ol>
    </section>
  </div>
</template>

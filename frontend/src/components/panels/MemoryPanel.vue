<script setup lang="ts">
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import { formatKst } from "../../utils/format";
import { MEMORY_EVALUATION_REASONS } from "../../domain/memoryEvaluation";
const store = useOperationsStore();
const {
  memory,
  memoryError,
  memoryEvaluation,
  memoryEvaluationError,
  memoryEvaluationLoading,
} = storeToRefs(store);
const report = computed(() => memoryEvaluation.value?.evaluation);
const sourceUnavailable = computed(
  () =>
    report.value?.source_status === "UNAVAILABLE" ||
    memoryEvaluation.value?.source.status === "UNAVAILABLE",
);
const sourceStale = computed(
  () =>
    !!memoryEvaluationError.value ||
    memoryEvaluation.value?.source.status === "STALE",
);
const screeningLabel = computed(() => {
  if (!report.value)
    return memoryEvaluationLoading.value
      ? "평가 정보 조회 중"
      : "평가 정보 확인 불가";
  if (sourceUnavailable.value) return "평가 정보 확인 불가";
  if (sourceStale.value) return "STALE · 마지막 조회 결과";
  return report.value.readiness.ready_for_metadata_review
    ? "Metadata 검토 준비됨"
    : "평가 자료 수집 중";
});
onMounted(() => void store.refreshMemory());
</script>
<template>
  <div class="panel-content stack">
    <section class="stack" aria-label="기억 평가 준비 상태" aria-live="polite">
      <div class="settings-actions">
        <strong>{{ screeningLabel }}</strong>
        <button
          type="button"
          :disabled="memoryEvaluationLoading"
          @click="store.refreshMemory()"
        >
          {{ memoryEvaluationLoading ? "조회 중…" : "새로고침" }}
        </button>
      </div>
      <p v-if="memoryEvaluationError" class="inline-alert">
        {{ memoryEvaluationError }}
      </p>
      <template v-if="report && !sourceUnavailable">
        <dl class="data-list compact">
          <div>
            <dt>활성 표본</dt>
            <dd>
              {{ report.items.active }} /
              {{ report.readiness.minimum_active_items }}건
            </dd>
          </div>
          <div>
            <dt>전체 / 대체 / 삭제</dt>
            <dd>
              {{ report.items.total }} / {{ report.items.superseded }} /
              {{ report.items.deleted }}건
            </dd>
          </div>
          <div>
            <dt>관찰 기간</dt>
            <dd>
              {{ report.observation.elapsed_days }} /
              {{ report.readiness.minimum_days }}일
            </dd>
          </div>
          <div>
            <dt>원본 메시지 연결</dt>
            <dd>
              {{ report.provenance.active_message_linked }} /
              {{ report.items.active }}건
            </dd>
          </div>
          <div>
            <dt>대화 turn 연결</dt>
            <dd>
              {{ report.provenance.active_turn_linked }} /
              {{ report.items.active }}건
            </dd>
          </div>
          <div>
            <dt>첫 표본 / 최근 표본</dt>
            <dd>
              {{ formatKst(report.observation.first_item_at) }} /
              {{ formatKst(report.observation.last_item_at) }}
            </dd>
          </div>
        </dl>
      </template>
      <ul v-if="report?.readiness.reasons.length">
        <li v-for="reason in report.readiness.reasons" :key="reason">
          {{ MEMORY_EVALUATION_REASONS[reason] }}
        </li>
      </ul>
      <p v-if="memoryEvaluation" class="panel-footnote">
        LAST CHECK / {{ formatKst(memoryEvaluation.checked_at) }} · SOURCE
        UPDATE / {{ formatKst(memoryEvaluation.source.last_success_at) }}
      </p>
      <p class="panel-footnote">
        활성 표본과 경과 기간은 평가 준비 기준입니다. 연속 수집·표본 다양성·응답
        품질을 보장하지 않습니다. 검토 준비가 되어도 답변에 기억을 사용하는
        기능은 자동으로 켜지지 않습니다.
      </p>
    </section>
    <p
      v-if="memoryError || memory?.source_status === 'UNAVAILABLE'"
      class="inline-alert"
    >
      {{ memoryError ?? "Memory source is unavailable." }}
    </p>
    <ol v-else-if="memory?.memory.length" class="trace-list">
      <li v-for="item in memory.memory" :key="item.id">
        <header>
          <strong>{{ item.kind.toUpperCase() }}</strong
          ><time>{{ formatKst(item.created_at) }}</time>
        </header>
        <dl class="data-list compact">
          <div>
            <dt>ID</dt>
            <dd>{{ item.id }}</dd>
          </div>
          <div>
            <dt>SCOPE</dt>
            <dd>{{ item.disclosure }}</dd>
          </div>
          <div>
            <dt>CONFIDENCE</dt>
            <dd>{{ item.confidence }}</dd>
          </div>
        </dl>
      </li>
    </ol>
    <p v-else class="empty-state">표시할 memory metadata가 없습니다.</p>
    <p class="panel-footnote">METADATA ONLY / MEMORY CONTENT IS NEVER LISTED</p>
  </div>
</template>

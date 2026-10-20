<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import { formatKst } from "../../utils/format";
import { MEMORY_EVALUATION_REASONS } from "../../domain/memoryEvaluation";
import {
  MEMORY_KIND_LABELS,
  MEMORY_SCOPE_LABELS,
} from "../../domain/memoryLabels";
import { api } from "../../services/api";
import type { MemoryDetailResponse } from "../../types/api";
import MemoryItemDetail from "./MemoryItemDetail.vue";
const props = defineProps<{
  canReadContent?: boolean;
  currentActorId?: string;
}>();
const selectedId = ref<number | null>(null);
const detail = ref<MemoryDetailResponse | null>(null);
const detailError = ref<string | null>(null);
const detailLoading = ref(false);
let detailRevision = 0;
function closeDetail(): void {
  detailRevision++;
  selectedId.value = null;
  detail.value = null;
  detailError.value = null;
  detailLoading.value = false;
}
async function openDetail(id: number): Promise<void> {
  if (!props.canReadContent) return;
  closeDetail();
  const revision = detailRevision;
  selectedId.value = id;
  detailLoading.value = true;
  try {
    const response = await api.getMemoryDetail(id);
    if (revision === detailRevision && props.canReadContent)
      detail.value = response;
  } catch (error) {
    if (revision === detailRevision)
      detailError.value =
        error instanceof Error
          ? error.message
          : "기억 내용을 조회할 수 없습니다.";
  } finally {
    if (revision === detailRevision) detailLoading.value = false;
  }
}
watch(
  () => props.canReadContent,
  (allowed) => {
    if (!allowed) closeDetail();
  },
);
onBeforeUnmount(closeDetail);
const store = useOperationsStore();
const {
  memory,
  memoryError,
  memoryOwnerFilter,
  memoryLoading,
  memoryEvaluation,
  memoryEvaluationError,
  memoryEvaluationLoading,
} = storeToRefs(store);
const knownOwners = ref<string[]>([]);
watch(
  () => memory.value?.memory,
  (rows) => {
    knownOwners.value = [
      ...new Set([
        ...knownOwners.value,
        ...(rows ?? []).map((row) => row.owner_id),
      ]),
    ];
  },
  { immediate: true },
);
const ownerOptions = computed(() => [
  ...new Set([
    ...(props.currentActorId ? [props.currentActorId] : []),
    ...knownOwners.value,
  ]),
]);
function ownerLabel(id: string): string {
  return `${id === props.currentActorId ? "내 기억" : "사용자 기억"} · ID ${id}`;
}
function changeOwner(event: Event): void {
  closeDetail();
  void store.setMemoryOwnerFilter((event.target as HTMLSelectElement).value);
}
watch(memoryOwnerFilter, closeDetail);
watch(
  () => props.currentActorId,
  () => {
    closeDetail();
    // A previous administrator's personal selection must not become the next actor's default.
    if (memoryOwnerFilter.value) void store.setMemoryOwnerFilter("");
  },
);
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
    <p class="panel-footnote">
      대화에서 추출한 기억 후보입니다. 현재 답변에는 사용하지 않으며, 내용과
      출처를 검토하는 단계입니다. HEALTHY는 조회 상태이며 내용 품질 합격을
      뜻하지 않습니다.
    </p>
    <div class="usage-controls memory-owner-controls">
      <label>
        기억 소유자
        <select
          :value="memoryOwnerFilter"
          aria-label="기억 소유자"
          @change="changeOwner"
        >
          <option value="">모든 사용자</option>
          <option v-for="owner in ownerOptions" :key="owner" :value="owner">
            {{ ownerLabel(owner) }}
          </option>
        </select>
      </label>
    </div>
    <p class="panel-footnote">
      개인 범위는 각 소유자의 기억입니다. 관리자 본인의 기억만을 뜻하지
      않습니다. 소유자 목록은 조회된 항목 기준입니다.
    </p>
    <p class="panel-footnote">
      아래 수집·평가 통계는 소유자 필터와 관계없이 전체 사용자를 기준으로
      합니다.
    </p>
    <details
      :open="!memory?.memory.length"
      class="stack memory-evaluation-summary"
    >
      <summary>수집·평가 준비 상태 · {{ screeningLabel }}</summary>
      <section
        class="stack"
        aria-label="기억 평가 준비 상태"
        aria-live="polite"
      >
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
          활성 표본과 경과 기간은 평가 준비 기준입니다. 연속 수집·표본
          다양성·응답 품질을 보장하지 않습니다. 검토 준비가 되어도 답변에 기억을
          사용하는 기능은 자동으로 켜지지 않습니다.
        </p>
      </section>
    </details>
    <p
      v-if="memoryError || memory?.source_status === 'UNAVAILABLE'"
      class="inline-alert"
    >
      {{ memoryError ?? "Memory source is unavailable." }}
    </p>
    <ol v-else-if="memory?.memory.length" class="trace-list">
      <li v-for="item in memory.memory" :key="item.id">
        <header>
          <strong
            >{{ MEMORY_KIND_LABELS[item.kind] ?? item.kind }} · 후보 #{{
              item.id
            }}</strong
          ><time>{{ formatKst(item.created_at) }}</time>
        </header>
        <dl class="data-list compact">
          <div>
            <dt>소유자</dt>
            <dd>{{ ownerLabel(item.owner_id) }}</dd>
          </div>
          <div>
            <dt>ID</dt>
            <dd>{{ item.id }}</dd>
          </div>
          <div>
            <dt>SCOPE</dt>
            <dd>
              {{ MEMORY_SCOPE_LABELS[item.disclosure] ?? item.disclosure }}
            </dd>
          </div>
          <div>
            <dt>모델 추정 확신도</dt>
            <dd>{{ Math.round(item.confidence * 100) }}%</dd>
          </div>
        </dl>
        <div class="settings-actions">
          <button
            type="button"
            class="control-button"
            :disabled="
              !canReadContent || (detailLoading && selectedId === item.id)
            "
            :aria-label="`기억 후보 ${item.id} 내용 보기`"
            :aria-expanded="selectedId === item.id"
            @click="openDetail(item.id)"
          >
            {{
              detailLoading && selectedId === item.id ? "조회 중…" : "내용 보기"
            }}
          </button>
          <button
            v-if="selectedId === item.id"
            type="button"
            class="control-button"
            @click="closeDetail"
          >
            내용 닫기
          </button>
        </div>
        <template v-if="selectedId === item.id">
          <p v-if="detailError" class="inline-alert" role="alert">
            {{ detailError }}
          </p>
          <p v-if="detailLoading" class="empty-state">
            기억 후보 내용을 조회하고 있습니다.
          </p>
          <MemoryItemDetail
            v-if="detail"
            :detail="detail"
            :owner-label="ownerLabel(detail.memory.owner_id)"
          />
        </template>
      </li>
    </ol>
    <p v-else class="empty-state">
      {{
        memoryLoading
          ? "기억 목록 조회 중…"
          : "이 범위에 표시할 기억 후보가 없습니다."
      }}
    </p>
    <button
      v-if="memory?.next_cursor"
      type="button"
      class="control-button"
      :disabled="memoryLoading"
      @click="store.loadMoreMemory()"
    >
      {{ memoryLoading ? "조회 중…" : "다음 후보 보기" }}
    </button>
    <p v-if="!canReadContent" class="panel-footnote">
      후보 내용은 Discord 관리자 로그인 후 ‘내용 보기’로 열람할 수 있습니다.
      목록과 평가 집계는 로그인 없이 볼 수 있습니다.
    </p>
    <p v-else class="panel-footnote">
      내용은 선택한 항목만 조회하며 열람 이력을 남깁니다. 닫거나 로그아웃하면
      상세 내용을 화면에서 지웁니다.
    </p>
  </div>
</template>

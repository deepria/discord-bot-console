<script setup lang="ts">
import { computed } from "vue";
import type { MemoryDetailResponse } from "../../types/api";
import { formatKst } from "../../utils/format";
import {
  MEMORY_KIND_LABELS,
  MEMORY_STATUS_LABELS,
  MEMORY_SCOPE_LABELS,
  MEMORY_OWNER_LABELS,
} from "../../domain/memoryLabels";
const props = defineProps<{
  detail: MemoryDetailResponse;
  ownerLabel?: string;
}>();
const item = computed(() => props.detail.memory);
const ownerUrl = computed(() =>
  item.value.owner_type === "user" && /^\d+$/.test(item.value.owner_id)
    ? `https://discord.com/users/${item.value.owner_id}`
    : null,
);
</script>

<template>
  <section class="stack memory-item-detail" aria-label="기억 후보 내용">
    <p
      v-if="
        detail.source_status !== 'HEALTHY' || detail.source.status !== 'HEALTHY'
      "
      class="inline-alert"
    >
      출처 데이터가 오래됐거나 현재 상태를 확인할 수 없습니다. 아래는 조회된
      저장 항목입니다.
    </p>
    <strong v-if="ownerLabel">{{ ownerLabel }}</strong>
    <p class="memory-candidate-content">{{ item.content }}</p>
    <dl class="data-list compact">
      <div>
        <dt>종류</dt>
        <dd>{{ MEMORY_KIND_LABELS[item.kind] ?? item.kind }}</dd>
      </div>
      <div>
        <dt>대상</dt>
        <dd>
          {{ MEMORY_OWNER_LABELS[item.owner_type] ?? item.owner_type }} ID ·
          {{ item.owner_id }}
          <a
            v-if="ownerUrl"
            :href="ownerUrl"
            target="_blank"
            rel="noopener noreferrer"
            >Discord 사용자 보기</a
          >
        </dd>
      </div>
      <div>
        <dt>사용 범위</dt>
        <dd>{{ MEMORY_SCOPE_LABELS[item.disclosure] ?? item.disclosure }}</dd>
      </div>
      <div>
        <dt>상태</dt>
        <dd>
          {{ MEMORY_STATUS_LABELS[item.status] ?? item.status
          }}<span v-if="item.superseded_by">
            · 대체 후보 #{{ item.superseded_by }}</span
          >
        </dd>
      </div>
      <div>
        <dt>답변 사용</dt>
        <dd>미사용 · 수집·평가 중인 후보</dd>
      </div>
      <div>
        <dt>모델 추정 확신도</dt>
        <dd>
          {{ Math.round(item.confidence * 100) }}% · 실제 정확도 점수가
          아닙니다.
        </dd>
      </div>
      <div>
        <dt>추출·저장 시각</dt>
        <dd>{{ formatKst(item.created_at) }}</dd>
      </div>
      <div>
        <dt>마지막 변경</dt>
        <dd>{{ formatKst(item.updated_at) }}</dd>
      </div>
      <div>
        <dt>수집 장소</dt>
        <dd>{{ item.origin_realm }} / 채널 {{ item.origin_channel_id }}</dd>
      </div>
      <div>
        <dt>수집 당시 공개 여부</dt>
        <dd>{{ item.origin_public_at_capture ? "공개" : "비공개" }}</dd>
      </div>
    </dl>
    <strong>출처</strong>
    <ol v-if="item.sources.length" class="stack">
      <li
        v-for="(source, index) in item.sources"
        :key="`${source.message_id}-${index}`"
      >
        <a
          v-if="source.message_url"
          :href="source.message_url"
          target="_blank"
          rel="noopener noreferrer"
          >Discord 원본 메시지 {{ index + 1 }} 보기</a
        >
        <span v-else>원본 메시지 {{ index + 1 }} · 직접 링크 없음</span>
        <p>메시지 ID: {{ source.message_id }}</p>
        <p :class="{ 'inline-alert': !source.turn_id }">
          처리 turn: {{ source.turn_id ?? "연결 누락 — 확인 필요" }}
        </p>
      </li>
    </ol>
    <p v-else class="inline-alert">출처 메시지 연결이 없습니다.</p>
    <p class="panel-footnote">
      원본 대화는 이 화면으로 가져오지 않습니다. Discord 접근 권한이나 메시지
      삭제 여부에 따라 원본 링크를 열지 못할 수 있습니다.
    </p>
  </section>
</template>

<script setup lang="ts">
import type { TelemetryCoverage } from "../../types/api";
import { formatKst } from "../../utils/format";
defineProps<{ coverage?: TelemetryCoverage }>();
</script>
<template>
  <div class="panel-footnote" aria-label="자료 보존 범위" aria-live="polite">
    <p v-if="!coverage">자료 보존 범위를 확인할 수 없습니다.</p>
    <p v-else-if="coverage.mode === 'legacy_tail'">
      최근 로그 일부만 조회했습니다. 기간 전체의 집계·보존 여부는 확인되지
      않았습니다.
    </p>
    <template v-else>
      <p>
        보존 기준 {{ coverage.retention_days }}일 · 수집 시작
        {{ formatKst(coverage.collection_started_at) }}
      </p>
      <p v-if="coverage.oldest_at">
        현재 보존 기록 {{ formatKst(coverage.oldest_at) }} ~
        {{ formatKst(coverage.newest_at) }}
      </p>
      <p v-else>현재 보존 기록이 없습니다.</p>
      <p v-if="coverage.history_limited">
        선택 기간에 보존 시작 전 또는 보존 기한 밖의 구간이 포함됩니다.
      </p>
      <p v-if="coverage.truncated">
        조회 한도에 도달해 일부 자료만 표시합니다. 기간을 줄여 다시 조회해
        주세요.
      </p>
      <p v-if="coverage.cleanup_pending">
        보존 기한이 지난 자료의 저장소 정리가 대기 중입니다. 조회 결과에서는
        제외했습니다.
      </p>
      <p>수집 시작 이전 자료와 쓰기 실패 구간의 완전성은 보장하지 않습니다.</p>
    </template>
  </div>
</template>

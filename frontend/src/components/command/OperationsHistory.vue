<script setup lang="ts">
import type { OperationRecord } from "../../types/api";
import { formatKst } from "../../utils/format";

defineProps<{ records: OperationRecord[] }>();
</script>

<template>
  <section class="operations-history" aria-label="현재 세션 명령 이력">
    <span class="panel-kicker">SESSION OPERATIONS HISTORY</span>
    <p v-if="!records.length">이 세션에서 실행한 명령이 없습니다.</p>
    <ol v-else>
      <li v-for="record in records" :key="record.id">
        <strong>{{ record.kind.toUpperCase() }}</strong>
        <span
          >{{ record.result.toUpperCase() }} /
          {{ record.postCheck.toUpperCase() }}</span
        >
        <time :datetime="record.requestedAt">{{
          formatKst(new Date(record.requestedAt))
        }}</time>
      </li>
    </ol>
    <p class="panel-footnote">
      브라우저 세션 이력이며 영구 감사 로그가 아닙니다.
    </p>
  </section>
</template>

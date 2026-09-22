<script setup lang="ts">
import type {
  ControlAction,
  PostCheckState,
  RequestState,
} from "../../types/api";

defineProps<{
  action: ControlAction;
  state: RequestState;
  postCheck: PostCheckState;
}>();
</script>

<template>
  <section class="command-timeline" aria-label="명령 실행 상태">
    <span class="panel-kicker">COMMAND TIMELINE</span>
    <ol>
      <li class="is-complete">영향 확인</li>
      <li
        :class="{
          'is-active': state === 'requesting',
          'is-complete': state === 'success' || state === 'failure',
        }"
      >
        {{ state === "requesting" ? "요청 실행 중" : "요청 결과" }}
      </li>
      <li
        :class="{
          'is-active': postCheck === 'pending',
          'is-complete': postCheck === 'healthy',
          'is-failed': postCheck === 'failed',
        }"
      >
        {{
          postCheck === "pending"
            ? "상태·로그 확인 중"
            : postCheck === "healthy"
              ? "post-check 통과"
              : postCheck === "failed"
                ? "post-check 재확인 필요"
                : "post-check 대기"
        }}
      </li>
    </ol>
    <p v-if="state === 'requesting'">
      {{ action.toUpperCase() }} 요청 뒤 상태와 로그를 다시 확인하고 있습니다.
    </p>
  </section>
</template>

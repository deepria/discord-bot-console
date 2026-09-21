<script setup lang="ts">
import type { Situation } from "../../domain/situation";

defineProps<{ situation: Situation }>();
defineEmits<{ inspect: []; logs: [] }>();
</script>

<template>
  <section
    class="action-card"
    :class="`is-${situation.level}`"
    aria-live="polite"
    aria-atomic="true"
  >
    <header>
      <span>{{
        situation.level === "action-required" ? "ACTION REQUIRED" : "ADVISORY"
      }}</span>
      <strong>{{ situation.title }}</strong>
    </header>
    <p>{{ situation.reason }}</p>
    <small>IMPACT / {{ situation.impact }}</small>
    <footer>
      <button type="button" @click="$emit('inspect')">상세 조사</button>
      <button type="button" class="secondary" @click="$emit('logs')">
        로그 보기
      </button>
    </footer>
  </section>
</template>

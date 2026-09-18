<script setup lang="ts">
defineProps<{ message: string; detail: string }>();
defineEmits<{ next: []; close: [] }>();
</script>

<template>
  <section
    id="rio-dialogue"
    class="rio-briefing"
    role="dialog"
    aria-label="Rio 대화"
    aria-live="polite"
    aria-atomic="true"
  >
    <button
      type="button"
      class="rio-dialogue-main"
      aria-label="다음 대화 보기"
      @click="$emit('next')"
    >
      <span class="briefing-speaker">RIO <small>SEMINAR</small></span>
      <strong>{{ message }}</strong>
      <span class="briefing-detail">{{ detail }}</span>
      <span class="dialogue-next" aria-hidden="true">CLICK / NEXT ▸</span>
    </button>
    <button
      type="button"
      class="rio-dialogue-close"
      aria-label="Rio 대화 닫기"
      @click="$emit('close')"
    >
      ×
    </button>
  </section>
</template>

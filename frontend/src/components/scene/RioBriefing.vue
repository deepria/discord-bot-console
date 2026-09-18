<script setup lang="ts">
defineProps<{ message: string; detail: string }>();
</script>

<template>
  <section class="rio-briefing" aria-live="polite" aria-atomic="true">
    <div class="briefing-speaker">RIO <small>SEMINAR</small></div>
    <p>{{ message }}</p>
    <span>{{ detail }}</span>
  </section>
</template>

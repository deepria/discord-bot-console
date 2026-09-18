<script setup lang="ts">
import { ref, watch } from "vue";
import type { SceneState } from "../../types/api";

const props = defineProps<{
  scene: SceneState;
  expression: string;
  dialogueOpen: boolean;
}>();
defineEmits<{ interact: [] }>();

const displayedExpression = ref(props.expression);

watch(
  () => props.expression,
  async (expression) => {
    if (expression === displayedExpression.value) return;
    const image = new Image();
    image.src = expression;
    try {
      await image.decode();
    } catch {
      // The browser will still render the new image when it becomes available.
    }
    displayedExpression.value = expression;
  },
);
</script>

<template>
  <button
    type="button"
    class="rio-character-button"
    :class="`rio-${scene}`"
    :aria-expanded="dialogueOpen"
    aria-controls="rio-dialogue"
    aria-label="Rio와 대화하기"
    @click="$emit('interact')"
  >
    <span class="rio-character-motion">
      <img class="rio-character" :src="displayedExpression" alt="" />
    </span>
    <span class="rio-talk-cue" aria-hidden="true">RIO / TALK</span>
  </button>
</template>

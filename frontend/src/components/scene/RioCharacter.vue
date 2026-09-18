<script setup lang="ts">
import type { SceneState } from "../../types/api";

defineProps<{
  scene: SceneState;
  expression: string;
  dialogueOpen: boolean;
}>();
defineEmits<{ interact: [] }>();
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
      <Transition name="rio-expression" mode="out-in">
        <img :key="expression" class="rio-character" :src="expression" alt="" />
      </Transition>
    </span>
    <span class="rio-talk-cue" aria-hidden="true">RIO / TALK</span>
  </button>
</template>

<script setup lang="ts">
import type { SceneState } from "../../types/api";
import rio from "../../assets/rio/rio-office-rio.png";

defineProps<{ scene: SceneState }>();
</script>

<template>
  <img
    class="rio-character"
    :class="`rio-${scene}`"
    :src="rio"
    alt="Rio가 관제실 중앙에서 시스템을 확인하고 있다"
  />
</template>

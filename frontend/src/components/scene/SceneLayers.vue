<script setup lang="ts">
import type { SceneState } from "../../types/api";
import healthyCeiling from "../../assets/office/healthy-ceiling.webp";
import healthyWall from "../../assets/office/healthy-monitor-wall.webp";
import healthyFloor from "../../assets/office/healthy-floor.webp";
import alertCeiling from "../../assets/office/alert-ceiling.webp";
import alertWall from "../../assets/office/alert-monitor-wall.webp";
import alertFloor from "../../assets/office/alert-floor.webp";

defineProps<{ scene: SceneState }>();
</script>

<template>
  <div class="scene-layers" :class="`scene-${scene}`" aria-hidden="true">
    <div class="room-state healthy-state">
      <img
        class="room-layer ceiling"
        :src="healthyCeiling"
        alt=""
        fetchpriority="high"
      />
      <img class="room-layer monitor-wall" :src="healthyWall" alt="" />
      <img class="room-layer floor" :src="healthyFloor" alt="" />
    </div>
    <div v-if="scene === 'alert'" class="room-state alert-state">
      <img class="room-layer ceiling" :src="alertCeiling" alt="" />
      <img class="room-layer monitor-wall" :src="alertWall" alt="" />
      <img class="room-layer floor" :src="alertFloor" alt="" />
    </div>
  </div>
</template>

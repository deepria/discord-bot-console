<script setup lang="ts">
import type { SceneState } from "../../types/api";
import healthyCeiling from "../../assets/office/healthy-ceiling.png";
import healthyWall from "../../assets/office/healthy-monitor-wall.png";
import healthyFloor from "../../assets/office/healthy-floor.png";
import alertCeiling from "../../assets/office/alert-ceiling.png";
import alertWall from "../../assets/office/alert-monitor-wall.png";
import alertFloor from "../../assets/office/alert-floor.png";

defineProps<{ scene: SceneState }>();
</script>

<template>
  <div class="scene-layers" :class="`scene-${scene}`" aria-hidden="true">
    <div class="room-state healthy-state">
      <img class="room-layer ceiling" :src="healthyCeiling" alt="" />
      <img class="room-layer monitor-wall" :src="healthyWall" alt="" />
      <img class="room-layer floor" :src="healthyFloor" alt="" />
    </div>
    <div class="room-state alert-state">
      <img class="room-layer ceiling" :src="alertCeiling" alt="" />
      <img class="room-layer monitor-wall" :src="alertWall" alt="" />
      <img class="room-layer floor" :src="alertFloor" alt="" />
    </div>
  </div>
</template>

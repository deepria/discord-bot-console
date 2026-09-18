<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";

const store = useOperationsStore();
const { logs, logConnection, logError, unseenLogCount, followingLogs } =
  storeToRefs(store);
const terminal = ref<HTMLElement | null>(null);

function followLatest(): void {
  store.setFollowingLogs(true);
  void nextTick(() => {
    if (terminal.value) terminal.value.scrollTop = terminal.value.scrollHeight;
  });
}

function onScroll(): void {
  const node = terminal.value;
  if (!node) return;
  const nearBottom =
    node.scrollHeight - node.scrollTop - node.clientHeight < 36;
  store.setFollowingLogs(nearBottom);
}

watch(
  () => logs.value.length,
  () => {
    if (followingLogs.value) followLatest();
  },
  { flush: "post" },
);
</script>

<template>
  <div class="panel-content logs-content">
    <div class="stream-meta">
      <span>STREAM / {{ logConnection.toUpperCase() }}</span>
      <button
        v-if="unseenLogCount"
        type="button"
        class="new-items-button"
        @click="followLatest"
      >
        새 로그 {{ unseenLogCount }}개 ↓
      </button>
    </div>
    <p v-if="logError" class="inline-alert">{{ logError }}</p>
    <pre
      ref="terminal"
      class="log-terminal"
      role="log"
      aria-live="off"
      tabindex="0"
      @scroll="onScroll"
      >{{ logs.join("\n") || "No logs yet" }}</pre>
  </div>
</template>

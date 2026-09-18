<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import { formatEventDetails, formatKst } from "../../utils/format";

const store = useOperationsStore();
const { status } = storeToRefs(store);
</script>

<template>
  <div class="panel-content event-list" role="log" aria-live="off">
    <p v-if="status?.events_error" class="inline-alert">
      {{ status.events_error }}
    </p>
    <ol v-if="status?.events.length" reversed>
      <li
        v-for="(event, index) in [...status.events].reverse()"
        :key="`${event.at}-${event.event}-${index}`"
      >
        <time>{{ formatKst(event.at) }}</time>
        <strong>{{ event.event ?? "event" }}</strong>
        <code>{{ formatEventDetails(event) }}</code>
      </li>
    </ol>
    <p v-else class="empty-state">수신된 이벤트가 없습니다.</p>
  </div>
</template>

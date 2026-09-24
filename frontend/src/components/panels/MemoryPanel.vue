<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import { formatKst } from "../../utils/format";
const store = useOperationsStore();
const { memory, memoryError } = storeToRefs(store);
onMounted(() => void store.refreshMemory());
</script>
<template>
  <div class="panel-content stack">
    <p
      v-if="memoryError || memory?.source_status === 'UNAVAILABLE'"
      class="inline-alert"
    >
      {{ memoryError ?? "Memory source is unavailable." }}
    </p>
    <ol v-else-if="memory?.memory.length" class="trace-list">
      <li v-for="item in memory.memory" :key="item.id">
        <header>
          <strong>{{ item.kind.toUpperCase() }}</strong
          ><time>{{ formatKst(item.created_at) }}</time>
        </header>
        <dl class="data-list compact">
          <div>
            <dt>ID</dt>
            <dd>{{ item.id }}</dd>
          </div>
          <div>
            <dt>SCOPE</dt>
            <dd>{{ item.disclosure }}</dd>
          </div>
          <div>
            <dt>CONFIDENCE</dt>
            <dd>{{ item.confidence }}</dd>
          </div>
        </dl>
      </li>
    </ol>
    <p v-else class="empty-state">표시할 memory metadata가 없습니다.</p>
    <p class="panel-footnote">METADATA ONLY / MEMORY CONTENT IS NEVER LISTED</p>
  </div>
</template>

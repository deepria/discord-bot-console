<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import { formatKst } from "../../utils/format";
import BotControlActions from "../command/BotControlActions.vue";
import OperationsHistory from "../command/OperationsHistory.vue";
defineProps<{ canManage?: boolean }>();
const store = useOperationsStore();
const { operationsHistory, persistentOperations, persistentOperationsError } =
  storeToRefs(store);
</script>

<template>
  <div class="panel-content stack">
    <p class="authorization">AUTHORIZATION / DISCORD ADMIN</p>
    <BotControlActions :can-manage="canManage" />
    <OperationsHistory :records="operationsHistory" />
    <section
      class="operations-history"
      aria-labelledby="persistent-operations-title"
    >
      <h3 id="persistent-operations-title">PERSISTENT OPERATION AUDIT</h3>
      <p v-if="persistentOperationsError" class="inline-alert">
        {{ persistentOperationsError }}
      </p>
      <ol v-else-if="persistentOperations.length" class="operation-list">
        <li
          v-for="operation in persistentOperations"
          :key="operation.operation_id"
        >
          <strong>{{ operation.kind.toUpperCase() }}</strong>
          <span
            >{{ operation.result.toUpperCase() }} /
            {{ operation.post_check.toUpperCase() }}</span
          >
          <small>{{ formatKst(operation.completed_at) }}</small>
        </li>
      </ol>
      <p v-else class="empty-state">영구 제어 이력이 아직 없습니다.</p>
    </section>
  </div>
</template>

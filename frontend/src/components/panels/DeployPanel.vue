<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import type { DeploymentRecord } from "../../types/api";
import { formatKst } from "../../utils/format";

const store = useOperationsStore();
const { deployments, deploymentsError, lastDeploymentsAt } = storeToRefs(store);
const items = computed(
  () =>
    [
      deployments.value?.console,
      ...(deployments.value?.deployments ?? []),
    ].filter(Boolean) as DeploymentRecord[],
);

function serviceValue(item: DeploymentRecord, key: string): string {
  const value = item.service?.[key];
  return value == null ? "-" : String(value);
}
</script>

<template>
  <div class="panel-content deployment-list">
    <p v-if="deploymentsError" class="inline-alert">{{ deploymentsError }}</p>
    <article v-for="item in items" :key="`${item.component}-${item.revision}`">
      <header>
        <strong>{{ String(item.component ?? "unknown").toUpperCase() }}</strong>
        <code>{{ item.revision ?? "unknown revision" }}</code>
      </header>
      <p v-if="item.available === false">{{ item.detail }}</p>
      <dl v-else class="data-list compact">
        <div>
          <dt>DEPLOY</dt>
          <dd>
            {{
              item.state ??
              `${serviceValue(item, "ActiveState")}/${serviceValue(item, "Result")}`
            }}
          </dd>
        </div>
        <div>
          <dt>UPDATE</dt>
          <dd>{{ item.update_available ? "AVAILABLE" : "CURRENT" }}</dd>
        </div>
        <div>
          <dt>LOCAL</dt>
          <dd>{{ item.working_tree_dirty ? "CHANGED" : "CLEAN" }}</dd>
        </div>
        <div>
          <dt>LAST</dt>
          <dd>{{ formatKst(item.at ?? item.last_success_at) }}</dd>
        </div>
      </dl>
    </article>
    <p v-if="!items.length && !deploymentsError" class="empty-state">
      배포 상태를 불러오는 중입니다.
    </p>
    <p class="panel-footnote">
      LAST REFRESH / {{ formatKst(lastDeploymentsAt) }}
    </p>
  </div>
</template>

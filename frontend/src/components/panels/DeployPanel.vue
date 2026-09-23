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

function statusLabel(status: DeploymentRecord["status"]): string {
  return status === "succeeded" ? "HEALTHY" : status.toUpperCase();
}
</script>

<template>
  <div class="panel-content deployment-list">
    <p v-if="deploymentsError" class="inline-alert">{{ deploymentsError }}</p>
    <article v-for="item in items" :key="item.deployment_id">
      <header>
        <strong>{{ String(item.component ?? "unknown").toUpperCase() }}</strong>
        <code>{{ item.running_revision ?? "UNVERIFIED REVISION" }}</code>
      </header>
      <dl class="data-list compact">
        <div>
          <dt>STATUS</dt>
          <dd>{{ statusLabel(item.status) }}</dd>
        </div>
        <div>
          <dt>PHASE</dt>
          <dd>{{ item.phase.toUpperCase() }}</dd>
        </div>
        <div>
          <dt>TARGET</dt>
          <dd>{{ item.target_revision ?? "-" }}</dd>
        </div>
        <div>
          <dt>VERIFIED</dt>
          <dd>{{ formatKst(item.verified_at) }}</dd>
        </div>
      </dl>
      <p v-if="item.error" class="inline-alert">{{ item.error }}</p>
      <ul
        v-if="item.checks.length"
        class="check-list"
        aria-label="배포 검증 결과"
      >
        <li
          v-for="check in item.checks"
          :key="`${item.deployment_id}-${check.name}`"
        >
          {{ check.name.toUpperCase() }} / {{ check.status.toUpperCase() }} /
          {{ formatKst(check.at) }}
        </li>
      </ul>
    </article>
    <p v-if="!items.length && !deploymentsError" class="empty-state">
      검증 가능한 배포 상태가 아직 없습니다.
    </p>
    <p class="panel-footnote">
      LAST REFRESH / {{ formatKst(lastDeploymentsAt) }}
    </p>
  </div>
</template>

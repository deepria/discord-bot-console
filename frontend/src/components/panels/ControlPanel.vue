<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import type { ControlAction } from "../../types/api";
import ConfirmDialog from "../common/ConfirmDialog.vue";
import CommandTimeline from "../command/CommandTimeline.vue";
import OperationsHistory from "../command/OperationsHistory.vue";

const store = useOperationsStore();
const { control, controlPostCheck, operationsHistory } = storeToRefs(store);
const pendingAction = ref<ControlAction | null>(null);

const commandCopy = computed(() => {
  switch (pendingAction.value) {
    case "start":
      return {
        title: "Rio Bot을 시작할까요?",
        description:
          "rio-bot.service를 시작합니다. 상태와 최근 로그로 online 복구를 확인합니다.",
        label: "시작 실행",
      };
    case "restart":
      return {
        title: "Rio Bot을 재시작할까요?",
        description:
          "Discord 응답이 잠시 중단될 수 있습니다. 요청 뒤 상태와 최근 로그로 복구를 확인합니다.",
        label: "재시작 실행",
      };
    case "stop":
      return {
        title: "Rio Bot을 중지할까요?",
        description:
          "Discord 응답이 중단됩니다. 다시 시작하려면 START 명령이 필요하며, 요청 뒤 offline 상태를 확인합니다.",
        label: "중지 실행",
      };
    default:
      return {
        title: "명령을 실행할까요?",
        description: "명령 영향과 결과를 확인합니다.",
        label: "실행",
      };
  }
});

function requestExecution(action: ControlAction): void {
  if (control.value.state === "requesting") return;
  pendingAction.value = action;
}

async function execute(action: ControlAction): Promise<void> {
  await store.runControl(action);
}

async function confirmExecution(): Promise<void> {
  const action = pendingAction.value;
  pendingAction.value = null;
  if (action) await execute(action);
}
</script>

<template>
  <div class="panel-content stack">
    <p class="authorization">AUTHORIZATION / CLOUDFLARE ACCESS + AGENT TOKEN</p>
    <div class="control-grid">
      <button
        class="control-button start"
        type="button"
        :disabled="control.state === 'requesting'"
        @click="requestExecution('start')"
      >
        <span>START</span><small>Activate rio-bot.service</small>
      </button>
      <button
        class="control-button"
        type="button"
        :disabled="control.state === 'requesting'"
        @click="requestExecution('restart')"
      >
        <span>RESTART</span><small>Restart the running service</small>
      </button>
      <button
        class="control-button danger"
        type="button"
        :disabled="control.state === 'requesting'"
        @click="requestExecution('stop')"
      >
        <span>STOP</span><small>Requires confirmation</small>
      </button>
    </div>
    <p
      v-if="control.state !== 'idle'"
      class="control-result"
      :class="`is-${control.state}`"
    >
      {{ control.state.toUpperCase() }} /
      {{ control.message || control.action.toUpperCase() }}
    </p>
    <CommandTimeline
      :action="control.action"
      :state="control.state"
      :post-check="controlPostCheck"
    />
    <OperationsHistory :records="operationsHistory" />
    <ConfirmDialog
      :open="pendingAction !== null"
      :title="commandCopy.title"
      :description="commandCopy.description"
      :confirm-label="commandCopy.label"
      @cancel="pendingAction = null"
      @confirm="confirmExecution"
    />
  </div>
</template>

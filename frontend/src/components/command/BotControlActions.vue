<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import type { ControlAction } from "../../types/api";
import ConfirmDialog from "../common/ConfirmDialog.vue";
import CommandTimeline from "./CommandTimeline.vue";

const props = withDefaults(
  defineProps<{
    canManage?: boolean;
    actions?: ControlAction[];
  }>(),
  { canManage: false, actions: () => ["start", "restart", "stop"] },
);
const store = useOperationsStore();
const { control, controlPostCheck } = storeToRefs(store);
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
  if (
    !props.canManage ||
    !props.actions.includes(action) ||
    control.value.state === "requesting"
  )
    return;
  pendingAction.value = action;
}

async function execute(action: ControlAction): Promise<void> {
  await store.runControl(action);
}

async function confirmExecution(): Promise<void> {
  const action = pendingAction.value;
  pendingAction.value = null;
  if (
    action &&
    props.canManage &&
    props.actions.includes(action) &&
    control.value.state !== "requesting"
  )
    await execute(action);
}
watch(
  () => props.canManage,
  (allowed) => {
    if (!allowed) pendingAction.value = null;
  },
);
</script>

<template>
  <div class="bot-control-actions">
    <p v-if="!canManage" class="panel-footnote">
      Bot 제어에는 Discord 관리자 로그인이 필요합니다. 상태 조회는 로그인 없이
      사용할 수 있습니다.
    </p>
    <div class="control-grid">
      <button
        v-if="actions.includes('start')"
        class="control-button start"
        type="button"
        :disabled="!canManage || control.state === 'requesting'"
        @click="requestExecution('start')"
      >
        <span>START</span><small>Activate rio-bot.service</small>
      </button>
      <button
        v-if="actions.includes('restart')"
        class="control-button"
        type="button"
        :disabled="!canManage || control.state === 'requesting'"
        @click="requestExecution('restart')"
      >
        <span>RESTART</span><small>Restart the running service</small>
      </button>
      <button
        v-if="actions.includes('stop')"
        class="control-button danger"
        type="button"
        :disabled="!canManage || control.state === 'requesting'"
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
      v-if="control.state !== 'idle'"
      :action="control.action"
      :state="control.state"
      :post-check="controlPostCheck"
    />
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

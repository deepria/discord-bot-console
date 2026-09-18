<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import type { ControlAction } from "../../types/api";
import ConfirmDialog from "../common/ConfirmDialog.vue";

const store = useOperationsStore();
const { control } = storeToRefs(store);
const confirmStop = ref(false);

async function execute(action: ControlAction): Promise<void> {
  await store.runControl(action);
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
        @click="execute('start')"
      >
        <span>START</span><small>Activate rio-bot.service</small>
      </button>
      <button
        class="control-button"
        type="button"
        :disabled="control.state === 'requesting'"
        @click="execute('restart')"
      >
        <span>RESTART</span><small>Restart the running service</small>
      </button>
      <button
        class="control-button danger"
        type="button"
        :disabled="control.state === 'requesting'"
        @click="confirmStop = true"
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
    <ConfirmDialog
      :open="confirmStop"
      title="Rio Bot을 중지할까요?"
      description="Discord 응답이 중단됩니다. 다시 시작하려면 START 명령이 필요합니다."
      @cancel="confirmStop = false"
      @confirm="
        confirmStop = false;
        execute('stop');
      "
    />
  </div>
</template>

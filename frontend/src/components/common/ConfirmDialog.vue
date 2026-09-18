<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps<{
  open: boolean;
  title: string;
  description: string;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);

watch(
  () => props.open,
  async (open) => {
    await nextTick();
    if (open && !dialog.value?.open) dialog.value?.showModal();
    if (!open && dialog.value?.open) dialog.value.close();
  },
  { immediate: true },
);

function cancel(): void {
  emit("cancel");
}

function onBackdropClick(event: MouseEvent): void {
  if (event.target === dialog.value) cancel();
}

onBeforeUnmount(() => dialog.value?.close());
</script>

<template>
  <dialog
    ref="dialog"
    class="confirm-dialog"
    aria-labelledby="confirm-title"
    aria-describedby="confirm-description"
    @cancel.prevent="cancel"
    @click="onBackdropClick"
    @keydown.esc.stop
  >
    <p class="panel-kicker">RIO CONTROL / CONFIRMATION</p>
    <h3 id="confirm-title">{{ title }}</h3>
    <p id="confirm-description">{{ description }}</p>
    <div class="dialog-actions">
      <button type="button" class="control-button" @click="cancel">취소</button>
      <button
        type="button"
        class="control-button danger"
        autofocus
        @click="$emit('confirm')"
      >
        중지 실행
      </button>
    </div>
  </dialog>
</template>

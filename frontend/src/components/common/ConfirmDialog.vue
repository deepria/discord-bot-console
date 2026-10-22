<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from "vue";

const props = defineProps<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);
const dialogId = useId();
let returnFocus: HTMLElement | null = null;

watch(
  () => props.open,
  async (open) => {
    await nextTick();
    if (open && !dialog.value?.open) {
      returnFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.value?.showModal();
      cancelButton.value?.focus();
    }
    if (!open && dialog.value?.open) {
      const modal = dialog.value;
      modal.close();
      if (
        document.activeElement === document.body ||
        modal.contains(document.activeElement)
      ) {
        const target =
          returnFocus?.isConnected && !returnFocus.matches(":disabled")
            ? returnFocus
            : returnFocus?.closest<HTMLElement>(".monitor-panel");
        if (target?.isConnected) target.focus({ preventScroll: true });
      }
    }
  },
  { immediate: true },
);

function cancel(): void {
  emit("cancel");
}

function onTab(event: KeyboardEvent): void {
  const buttons = Array.from(
    dialog.value?.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    ) ?? [],
  );
  if (!buttons.length) return;
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.shiftKey
    ? current <= 0
      ? buttons.length - 1
      : current - 1
    : (current + 1) % buttons.length;
  event.preventDefault();
  buttons[next]?.focus();
}

function onBackdropClick(event: MouseEvent): void {
  if (event.target === dialog.value) cancel();
}

onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close();
});
</script>

<template>
  <dialog
    ref="dialog"
    class="confirm-dialog"
    :aria-labelledby="`${dialogId}-title`"
    :aria-describedby="`${dialogId}-description`"
    @cancel.prevent="cancel"
    @click="onBackdropClick"
    @keydown.tab="onTab"
    @keydown.esc.stop
  >
    <p class="panel-kicker">RIO CONTROL / CONFIRMATION</p>
    <h3 :id="`${dialogId}-title`">{{ title }}</h3>
    <p :id="`${dialogId}-description`">{{ description }}</p>
    <div class="dialog-actions">
      <button
        ref="cancelButton"
        type="button"
        class="control-button"
        autofocus
        @click="cancel"
      >
        취소
      </button>
      <button
        type="button"
        class="control-button danger"
        @click="$emit('confirm')"
      >
        {{ confirmLabel ?? "실행" }}
      </button>
    </div>
  </dialog>
</template>

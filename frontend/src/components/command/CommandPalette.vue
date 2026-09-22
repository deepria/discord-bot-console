<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { MonitorId } from "../../types/api";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; select: [id: MonitorId] }>();
const query = ref("");
const input = ref<HTMLInputElement | null>(null);
const palette = ref<HTMLElement | null>(null);

const commands: { id: MonitorId; label: string; keywords: string }[] = [
  { id: "system", label: "System Status 열기", keywords: "system status 상태" },
  { id: "link", label: "Data Link 열기", keywords: "data link 연결" },
  {
    id: "runtime",
    label: "Discord / AI 열기",
    keywords: "discord ai runtime 런타임",
  },
  { id: "events", label: "Live Events 열기", keywords: "events 이벤트" },
  { id: "logs", label: "Log Stream 열기", keywords: "logs log 로그" },
  {
    id: "deploy",
    label: "Deploy Watch 열기",
    keywords: "deploy deployment 배포",
  },
  {
    id: "control",
    label: "Rio Control 열기",
    keywords: "control start restart stop 제어 시작 재시작 중지",
  },
];

const filtered = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  if (!keyword) return commands;
  return commands.filter((command) =>
    `${command.label} ${command.keywords}`.toLowerCase().includes(keyword),
  );
});

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    query.value = "";
    await nextTick();
    input.value?.focus();
  },
);

function choose(id: MonitorId): void {
  emit("select", id);
  emit("close");
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }
  if (event.key === "Tab") {
    const focusable = Array.from(
      palette.value?.querySelectorAll<HTMLElement>("input, button") ?? [],
    );
    if (!focusable.length) return;
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey
      ? current <= 0
        ? focusable.length - 1
        : current - 1
      : current === focusable.length - 1
        ? 0
        : current + 1;
    event.preventDefault();
    focusable[next]?.focus();
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="command-palette-backdrop"
      @mousedown.self="emit('close')"
    >
      <section
        ref="palette"
        class="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="명령 팔레트"
        @keydown="onKeydown"
      >
        <label>
          <span class="panel-kicker">COMMAND PALETTE</span>
          <input
            ref="input"
            v-model="query"
            type="search"
            placeholder="패널 또는 명령 검색…"
            aria-label="명령 검색"
          />
        </label>
        <p>위험 명령은 바로 실행하지 않고 Rio Control로 이동합니다.</p>
        <ul>
          <li v-for="command in filtered" :key="command.id">
            <button type="button" @click="choose(command.id)">
              {{ command.label }}
            </button>
          </li>
        </ul>
        <p v-if="!filtered.length">일치하는 명령이 없습니다.</p>
      </section>
    </div>
  </Teleport>
</template>

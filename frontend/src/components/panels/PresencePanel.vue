<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import {
  STATUS_LABELS,
  ACTIVITY_LABELS,
  presenceTextError,
  type PresenceConfiguration,
} from "../../domain/presence";
import { formatKst } from "../../utils/format";
import ConfirmDialog from "../common/ConfirmDialog.vue";

const props = defineProps<{ canManage: boolean }>();
const store = useOperationsStore();
const { presence, presenceError, presencePending, presenceResult } =
  storeToRefs(store);
const draft = reactive<PresenceConfiguration>({
  mode: "manual",
  status: "online",
  activity_type: "playing",
  activity_text: "",
});
const dirty = ref(false);
const confirming = ref(false);
const current = computed(() => presence.value?.last_sent);
const maximum = computed(
  () => presence.value?.capabilities.text_max_length ?? 0,
);
const textError = computed(() =>
  draft.mode === "auto"
    ? null
    : presenceTextError(draft.activity_text, maximum.value),
);
const locked = computed(
  () =>
    !props.canManage ||
    presencePending.value ||
    !!presenceError.value ||
    !presence.value?.connected,
);

watch(
  () => presence.value?.configured,
  (value) => {
    if (value && !dirty.value) Object.assign(draft, value);
  },
  { immediate: true },
);

function editMode(): void {
  dirty.value = true;
  if (draft.mode === "manual" && presence.value)
    Object.assign(draft, presence.value.manual);
}

async function apply(): Promise<void> {
  confirming.value = false;
  if (locked.value || textError.value || !presence.value) return;
  const value =
    draft.mode === "auto"
      ? { ...presence.value.configured, mode: "auto" as const }
      : { ...draft, activity_text: draft.activity_text.trim() };
  // Auto is a server-owned policy; the existing validated fields satisfy the request schema.
  await store.writePresence(value);
}

function reloadDraft(): void {
  if (presence.value) Object.assign(draft, presence.value.configured);
  dirty.value = false;
}

watch(presencePending, (pending, wasPending) => {
  if (
    wasPending &&
    !pending &&
    presence.value?.operation?.state === "success" &&
    presenceResult.value?.startsWith("Discord Presence")
  )
    reloadDraft();
});
</script>

<template>
  <section
    class="operations-history presence-panel"
    aria-labelledby="presence-title"
  >
    <h3 id="presence-title">DISCORD PRESENCE</h3>
    <p v-if="presenceError" class="inline-alert">
      {{ presence ? "STALE · " : "UNAVAILABLE · " }}{{ presenceError }}
    </p>
    <p v-if="!presence">Presence 설정을 불러오는 중입니다.</p>
    <template v-else>
      <p class="presence-current">
        <span
          v-if="current"
          class="presence-dot"
          :class="`presence-${current.status}`"
          aria-hidden="true"
          >●</span
        >
        <strong>{{
          current ? STATUS_LABELS[current.status] : "아직 전송되지 않음"
        }}</strong>
        <span v-if="current"
          >{{ ACTIVITY_LABELS[current.activity_type] }}
          {{ current.activity_text }}</span
        >
      </p>
      <p class="panel-footnote">
        {{
          presence.connected
            ? "Discord 연결됨"
            : "Discord 연결 끊김 · 마지막 전송 기록"
        }}
        /
        {{
          presence.apply_state === "sent"
            ? "전송 완료"
            : presence.apply_state === "unknown"
              ? "적용 불확실 · 복구 중"
              : presence.apply_state === "pending"
                ? "재적용 대기"
                : "현재 적용 확인 불가"
        }}
        /
        {{ presence.configured.mode.toUpperCase() }}
        <br />LAST SENT /
        {{
          formatKst(
            presence.last_sent_at ? new Date(presence.last_sent_at) : null,
          )
        }}
      </p>
      <p v-if="!canManage" class="panel-footnote">
        변경하려면 Discord 관리자 로그인이 필요합니다.
      </p>
      <form
        class="settings-editor"
        @submit.prevent="confirming = true"
        @input="dirty = true"
      >
        <label for="presence-mode">Mode</label>
        <select
          id="presence-mode"
          v-model="draft.mode"
          :disabled="locked"
          @change="editMode"
        >
          <option value="auto">Auto</option>
          <option value="manual">Manual</option>
        </select>
        <p v-if="draft.mode === 'auto'" class="panel-footnote">
          Auto는 Online / Playing 대기 중을 적용합니다. 작업별 자동 규칙은 후속
          지원 예정입니다.
        </p>
        <template v-else>
          <label for="presence-status">Status</label>
          <select
            id="presence-status"
            v-model="draft.status"
            :disabled="locked"
          >
            <option
              v-for="status in presence.capabilities.statuses"
              :key="status"
              :value="status"
            >
              {{ STATUS_LABELS[status] }}
            </option>
          </select>
          <label for="presence-activity">Activity</label>
          <select
            id="presence-activity"
            v-model="draft.activity_type"
            :disabled="locked"
          >
            <option
              v-for="activity in presence.capabilities.activity_types"
              :key="activity"
              :value="activity"
            >
              {{ ACTIVITY_LABELS[activity] }}
            </option>
          </select>
          <label for="presence-text">Activity Text</label>
          <input
            id="presence-text"
            v-model="draft.activity_text"
            :disabled="locked"
            :aria-invalid="!!textError"
            aria-describedby="presence-text-help"
            placeholder="코드 수정 중"
          />
          <small id="presence-text-help">{{
            textError ??
            `${Array.from(draft.activity_text.trim()).length} / ${maximum}자`
          }}</small>
        </template>
        <p class="panel-footnote">
          Manual은 재시작 후에도 유지됩니다. Invisible은 오프라인으로 표시되며
          Bot은 계속 동작합니다. Streaming은 현재 지원하지 않습니다.
        </p>
        <div>
          <button type="submit" :disabled="locked || !!textError">
            {{ presencePending ? "적용 확인 중…" : "Apply" }}
          </button>
          <button
            type="button"
            :disabled="presencePending"
            @click="reloadDraft"
          >
            입력 되돌리기
          </button>
        </div>
      </form>
      <p v-if="presenceResult" role="status" aria-live="polite">
        {{ presenceResult }}
      </p>
      <p
        v-else-if="presence.operation?.error"
        class="inline-alert"
        role="status"
      >
        {{ presence.operation.error }}
      </p>
      <details v-if="presence.audit.length">
        <summary>PRESENCE CHANGE HISTORY</summary>
        <ol>
          <li v-for="event in presence.audit" :key="event.request_id">
            {{ event.actor_id }} · {{ event.outcome }} ·
            {{ formatKst(new Date(event.occurred_at)) }}
          </li>
        </ol>
      </details>
    </template>
    <button
      type="button"
      :disabled="presencePending"
      @click="store.refreshPresence"
    >
      현재 상태 다시 조회
    </button>
    <ConfirmDialog
      :open="confirming"
      title="Discord Presence 변경"
      :description="
        draft.mode === 'auto'
          ? 'Online / Playing 대기 중 기본 정책으로 전환합니다.'
          : `${STATUS_LABELS[draft.status]} / ${ACTIVITY_LABELS[draft.activity_type]} ${draft.activity_text.trim()}을 적용하고 재시작 후에도 유지합니다.`
      "
      confirm-label="Apply"
      @confirm="apply"
      @cancel="confirming = false"
    />
  </section>
</template>

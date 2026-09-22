<script setup lang="ts">
import { onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "../../stores/operations";
import { formatKst } from "../../utils/format";
import ConfirmDialog from "../common/ConfirmDialog.vue";

const emit = defineEmits<{ close: [] }>();
const store = useOperationsStore();
const {
  runtimeSettings,
  runtimeSettingsError,
  runtimeSettingsLoading,
  lastRuntimeSettingsAt,
  runtimeConfigAuditEvents,
  runtimeConfigAuditError,
  runtimeConfigAuditLoading,
  runtimeSettingPending,
  runtimeSettingResult,
  policySettings,
  policySettingsError,
  policySettingsLoading,
  policySettingPending,
} = storeToRefs(store);
const editing = ref<(typeof runtimeSettings.value)[number] | null>(null);
const draft = ref("");
const confirming = ref<"set" | "reset" | null>(null);
const editingPolicy = ref<{
  policy: "memory" | "chatlog" | "capture";
  scope: string;
  value: string;
} | null>(null);
const confirmingPolicy = ref(false);

function beginEdit(setting: (typeof runtimeSettings.value)[number]) {
  editing.value = setting;
  draft.value =
    setting.display_value === "(비움)" ? "none" : setting.display_value;
}
function requestReset(setting: (typeof runtimeSettings.value)[number]) {
  editing.value = setting;
  confirming.value = "reset";
}
async function confirmWrite() {
  if (!editing.value || !confirming.value) return;
  await store.writeRuntimeSetting(
    editing.value.key,
    confirming.value === "reset" ? null : draft.value,
  );
  confirming.value = null;
  editing.value = null;
}

function editPolicy(
  policy: "memory" | "chatlog" | "capture",
  scope: string,
  value: string,
) {
  editingPolicy.value = { policy, scope, value };
}

async function confirmPolicyWrite() {
  if (!editingPolicy.value) return;
  await store.writePolicySetting(
    editingPolicy.value.policy,
    editingPolicy.value.scope,
    editingPolicy.value.value,
  );
  confirmingPolicy.value = false;
  editingPolicy.value = null;
}

function constraint(setting: (typeof runtimeSettings.value)[number]): string {
  if (setting.kind === "bool") return "on/off";
  if (setting.kind === "prefixes") return "쉼표 구분 접두어";
  if (setting.minimum !== null || setting.maximum !== null) {
    return `${setting.minimum ?? "-∞"}–${setting.maximum ?? "∞"}`;
  }
  return setting.empty_allowed ? "비움 가능" : "문자열";
}

function guidance(setting: (typeof runtimeSettings.value)[number]): string {
  const guides: Record<string, string> = {
    call_prefixes:
      "예: 리오야, 리오 — 메시지 첫머리의 두 문구를 호출로 인식합니다.",
    dm_always_reply: "예: on — DM에서 멘션이나 접두어 없이도 응답합니다.",
    public_memory_in_dm:
      "예: off — DM 답변에서 서버 공개 기억을 참조하지 않습니다.",
    chat_web_search:
      "예: off — 채팅 웹 검색만 끕니다. 모델이나 API key는 바뀌지 않습니다.",
    community_lore:
      "예: off — 답변 문맥에서 community lore를 제외합니다. 데이터는 삭제하지 않습니다.",
    output_tokens: "예: 1800 — 답변 최대 길이를 조정합니다.",
    channel_context_chars:
      "예: 3000 — 최근 채널 문맥 예산을 조정합니다. 0이면 최근 문맥을 넣지 않습니다.",
    history_max_chars:
      "예: 24000 — 답변에 넣는 장기 대화 이력 문자 예산을 조정합니다.",
    lore_max_items:
      "예: 8 — 답변에 포함할 lore 항목 수를 제한합니다. 0이면 포함하지 않습니다.",
    lore_max_chars:
      "예: 5000 — 답변에 포함할 lore의 총 문자 예산을 조정합니다.",
    runtime_default_location:
      "예: 서울특별시 — 위치 생략 요청의 기본 위치입니다. none은 명시적으로 비웁니다.",
  };
  return (
    guides[setting.key] ?? "값은 Bot의 기존 runtime validation으로 확인됩니다."
  );
}

onMounted(() => {
  void Promise.all([
    store.refreshRuntimeSettings(),
    store.refreshRuntimeConfigAuditEvents(),
    store.refreshPolicySettings(),
  ]);
});
</script>

<template>
  <aside
    class="monitor-panel settings-panel"
    tabindex="-1"
    aria-labelledby="runtime-settings-title"
    @keydown.esc="emit('close')"
  >
    <header class="monitor-panel-header">
      <div>
        <span>CONFIGURATION / READ ONLY</span>
        <h2 id="runtime-settings-title">RUNTIME SETTINGS</h2>
      </div>
      <button
        type="button"
        class="panel-close"
        aria-label="상세 패널 닫기"
        @click="emit('close')"
      >
        ×
      </button>
    </header>
    <div class="panel-state-line">
      <i aria-hidden="true"></i>
      {{ runtimeSettingsLoading ? "LOADING" : "READ ONLY / AGENT SNAPSHOT" }}
    </div>
    <div class="panel-content stack">
      <p class="panel-footnote">
        Discord `/config`과 같은 runtime override 상태입니다. 변경은 관리자 확인
        뒤 Bot의 동일한 검증 서비스로 적용됩니다.
      </p>
      <p v-if="runtimeSettingsError" class="inline-alert">
        설정을 읽지 못했습니다. {{ runtimeSettingsError }}
      </p>
      <p
        v-else-if="!runtimeSettings.length && !runtimeSettingsLoading"
        class="panel-footnote"
      >
        표시할 런타임 설정이 없습니다.
      </p>
      <div v-else class="settings-list" aria-label="런타임 설정 목록">
        <article v-for="setting in runtimeSettings" :key="setting.key">
          <div>
            <strong>{{ setting.env_name }}</strong>
            <small>{{ constraint(setting) }}</small>
          </div>
          <output>{{ setting.display_value }}</output>
          <span :class="`source-${setting.source}`">
            {{ setting.source === "db" ? "DB OVERRIDE" : "STARTUP" }}
          </span>
          <div class="settings-actions">
            <button
              type="button"
              :disabled="Boolean(runtimeSettingPending)"
              @click="beginEdit(setting)"
            >
              EDIT
            </button>
            <button
              v-if="setting.source === 'db'"
              type="button"
              :disabled="Boolean(runtimeSettingPending)"
              @click="requestReset(setting)"
            >
              RESET
            </button>
          </div>
        </article>
      </div>
      <form
        v-if="editing && !confirming"
        class="settings-editor"
        @submit.prevent="confirming = 'set'"
      >
        <label :for="`setting-${editing.key}`"
          >{{ editing.env_name }} 새 값</label
        >
        <input
          :id="`setting-${editing.key}`"
          v-model="draft"
          :disabled="Boolean(runtimeSettingPending)"
          autofocus
        />
        <small
          >제약: {{ constraint(editing) }}. 적용 전 확인이 필요합니다.</small
        >
        <p class="panel-footnote">{{ guidance(editing) }}</p>
        <div>
          <button type="submit">확인 단계</button
          ><button type="button" @click="editing = null">취소</button>
        </div>
      </form>
      <p v-if="runtimeSettingResult" class="panel-footnote">
        {{ runtimeSettingResult }}
      </p>
      <section
        class="operations-history"
        aria-labelledby="policy-settings-title"
      >
        <h3 id="policy-settings-title">MEMORY &amp; CHATLOG POLICY</h3>
        <p>
          scope별 override를 변경할 수 있습니다. clear·purge는 Console에
          노출하지 않습니다.
        </p>
        <p v-if="policySettingsLoading">정책을 읽는 중입니다.</p>
        <p v-else-if="policySettingsError" class="inline-alert">
          정책을 읽지 못했습니다. {{ policySettingsError }}
        </p>
        <div v-else class="policy-list" aria-label="Memory 및 chatlog 정책">
          <article v-for="policy in policySettings" :key="policy.scope">
            <strong>{{ policy.scope }}</strong>
            <span
              >MEMORY {{ policy.memory_effective }} / {{ policy.memory_source }}
              <button
                type="button"
                @click="
                  editPolicy('memory', policy.scope, policy.memory_override)
                "
              >
                EDIT
              </button></span
            >
            <span
              >CHATLOG {{ policy.chatlog_effective }} /
              {{ policy.chatlog_source }}
              <button
                type="button"
                @click="
                  editPolicy('chatlog', policy.scope, policy.chatlog_override)
                "
              >
                EDIT
              </button></span
            >
            <span
              >CAPTURE {{ policy.capture_effective }} /
              {{ policy.capture_source }}
              <button
                type="button"
                @click="
                  editPolicy('capture', policy.scope, policy.capture_override)
                "
              >
                EDIT
              </button></span
            >
          </article>
        </div>
        <form
          v-if="editingPolicy && !confirmingPolicy"
          class="settings-editor"
          @submit.prevent="confirmingPolicy = true"
        >
          <label
            >{{ editingPolicy.policy.toUpperCase() }} /
            {{ editingPolicy.scope }}</label
          >
          <select v-model="editingPolicy.value">
            <option value="inherit">inherit</option>
            <option
              v-for="value in editingPolicy.policy === 'memory'
                ? ['normal', 'read_only', 'write_only', 'off']
                : editingPolicy.policy === 'chatlog'
                  ? ['on', 'off']
                  : ['all', 'direct']"
              :key="value"
              :value="value"
            >
              {{ value }}
            </option>
          </select>
          <p class="panel-footnote">
            범위를 좁히거나 capture 정책을 바꾸면 Bot의 recent context를
            안전하게 비웁니다.
          </p>
          <div>
            <button type="submit">확인 단계</button
            ><button type="button" @click="editingPolicy = null">취소</button>
          </div>
        </form>
      </section>
      <section class="operations-history" aria-labelledby="runtime-audit-title">
        <h3 id="runtime-audit-title">CONFIGURATION CHANGE HISTORY</h3>
        <p v-if="runtimeConfigAuditLoading">감사 이력을 읽는 중입니다.</p>
        <p v-else-if="runtimeConfigAuditError" class="inline-alert">
          감사 이력을 읽지 못했습니다. {{ runtimeConfigAuditError }}
        </p>
        <p v-else-if="!runtimeConfigAuditEvents.length">
          기록된 런타임 설정 변경이 없습니다.
        </p>
        <ol v-else>
          <li v-for="event in runtimeConfigAuditEvents" :key="event.id">
            <strong
              >{{ event.action }} / {{ event.outcome.toUpperCase() }}</strong
            >
            <span
              >{{ event.target }} · {{ event.actor_kind.toUpperCase() }}</span
            >
            <time>{{ formatKst(event.occurred_at) }}</time>
          </li>
        </ol>
        <p>변경 값과 대화 내용은 감사 이력에 저장하지 않습니다.</p>
      </section>
      <p class="panel-footnote">
        LAST SNAPSHOT / {{ formatKst(lastRuntimeSettingsAt) }}
      </p>
    </div>
  </aside>
  <ConfirmDialog
    :open="Boolean(confirming && editing)"
    :title="
      confirming === 'reset'
        ? 'DB override를 초기화할까요?'
        : 'Runtime 설정을 변경할까요?'
    "
    :description="
      confirming === 'reset'
        ? `${editing?.env_name}의 DB override를 지우고 startup 값으로 되돌립니다. ${editing ? guidance(editing) : ''}`
        : `${editing?.env_name}을 ${draft}(으)로 적용합니다. ${editing ? guidance(editing) : ''} 적용 뒤 서버 snapshot을 다시 확인합니다.`
    "
    :confirm-label="runtimeSettingPending ? '적용 중…' : '적용'"
    @confirm="confirmWrite"
    @cancel="confirming = null"
  />
  <ConfirmDialog
    :open="confirmingPolicy"
    title="Policy override를 변경할까요?"
    :description="`${editingPolicy?.policy.toUpperCase()}을 ${editingPolicy?.value}(으)로 적용합니다. 정책 변경 뒤 Bot은 stale recent context를 비웁니다.`"
    :confirm-label="policySettingPending ? '적용 중…' : '적용'"
    @confirm="confirmPolicyWrite"
    @cancel="confirmingPolicy = false"
  />
</template>

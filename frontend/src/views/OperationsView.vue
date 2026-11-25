<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import CommandPalette from "../components/command/CommandPalette.vue";
import MonitorPanel from "../components/panels/MonitorPanel.vue";
import SettingsPanel from "../components/panels/SettingsPanel.vue";
import StatusBadge from "../components/common/StatusBadge.vue";
import { usePolling } from "../composables/usePolling";
import { recentTurnErrors } from "../domain/recentErrors";
import { api } from "../services/api";
import { useOperationsStore } from "../stores/operations";
import type { ConsoleActor, MonitorId, UsageResponse } from "../types/api";
import { formatKst } from "../utils/format";
import "../styles/operations.css";

const route = useRoute();
const router = useRouter();
const investigation = [
  ["traces", "Trace"],
  ["events", "이벤트"],
  ["logs", "로그"],
  ["usage", "사용량"],
  ["memory", "기억"],
] as const;
const settingsSections = [
  ["runtime", "설정 목록"],
  ["control", "봇 조작"],
  ["recovery", "상태 및 복구"],
  ["deployment", "배포 상세"],
] as const;
const paletteOpen = ref(false);
const paletteTrigger = ref<HTMLElement | null>(null);
const activeInvestigation = computed(
  () => investigation.find(([id]) => id === route.query.view)?.[0] ?? "traces",
);
const activeSetting = computed(
  () =>
    settingsSections.find(([id]) => id === route.query.view)?.[0] ?? "runtime",
);
const activePanel = computed(() => {
  if (route.name === "ops-investigate") return activeInvestigation.value;
  if (route.name === "ops-settings") {
    if (activeSetting.value === "control") return "control";
    if (activeSetting.value === "recovery") return "system";
    if (activeSetting.value === "deployment") return "deploy";
  }
  return null;
});
const canManage = computed(() => authActor.value?.role === "admin");
const store = useOperationsStore();
const usage = ref<UsageResponse | null>(null);
const usageError = ref(false);
const authActor = ref<ConsoleActor | null>(null);
const oauthEnabled = ref(false);
const failures = computed(() => recentTurnErrors(store.status?.events ?? []));
const activity = computed(() =>
  (store.status?.events ?? [])
    .filter((item) =>
      ["turn.completed", "discord.connected", "discord.disconnected"].includes(
        item.event ?? "",
      ),
    )
    .slice(-3)
    .reverse(),
);
const deploymentRows = computed(() => {
  const result = new Map(
    (store.deployments?.deployments ?? [])
      .slice()
      .reverse()
      .map((row) => [row.component, row]),
  );
  if (store.deployments?.console)
    result.set("console", store.deployments.console);
  return [...result.values()].slice(0, 4);
});
const usageTotals = computed(() =>
  (usage.value?.groups ?? []).reduce(
    (total, row) => ({
      calls: total.calls + row.calls,
      errors: total.errors + row.errors,
    }),
    { calls: 0, errors: 0 },
  ),
);

watch(activePanel, (panel) => store.selectMonitor(panel), { immediate: true });
usePolling(() => store.refreshStatus(), 5000);
usePolling(() => store.refreshDeployments(), 10000);
usePolling(async () => {
  if (route.name !== "ops-overview") return;
  try {
    usage.value = await api.getUsage();
    usageError.value = false;
  } catch {
    usageError.value = true;
  }
}, 30000);

async function refreshAuth() {
  try {
    const result = await api.getAuthStatus();
    authActor.value = result.actor;
    oauthEnabled.value = result.oauth_enabled;
  } catch {
    authActor.value = null;
  }
}

async function logout() {
  try {
    await api.logout();
  } finally {
    authActor.value = null;
    await refreshAuth();
  }
}

function openPanel(id: MonitorId) {
  if (id === "control") {
    void router.push({ path: "/settings", query: { view: "control" } });
  } else if (id === "system" || id === "link" || id === "runtime") {
    void router.push({ path: "/settings", query: { view: "recovery" } });
  } else if (id === "deploy") {
    void router.push({ path: "/settings", query: { view: "deployment" } });
  } else {
    void router.push({ path: "/investigate", query: { view: id } });
  }
}

async function closePanel() {
  const path = route.name === "ops-settings" ? "/settings" : "/";
  await router.push(path);
  await nextTick();
  document
    .querySelector<HTMLElement>(
      path === "/"
        ? '.operations-header nav a[href="/"]'
        : '.operations-secondary a[aria-current="page"]',
    )
    ?.focus({ preventScroll: true });
}

function closePalette(restore = true) {
  paletteOpen.value = false;
  if (restore) void nextTick(() => paletteTrigger.value?.focus());
}

function handleShortcut(event: KeyboardEvent) {
  if (
    !event.defaultPrevented &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === "k" &&
    !document.querySelector("dialog[open]")
  ) {
    event.preventDefault();
    if (paletteOpen.value) closePalette();
    else paletteOpen.value = true;
  }
}

onMounted(() => {
  void refreshAuth();
  window.addEventListener("keydown", handleShortcut);
});
onUnmounted(() => {
  window.removeEventListener("keydown", handleShortcut);
  store.selectMonitor(null);
});

function activityLabel(event: string | null) {
  if (event === "turn.completed") return "응답 완료";
  if (event === "discord.connected") return "Discord 연결";
  return "Discord 연결 끊김";
}
</script>

<template>
  <div class="operations" :inert="paletteOpen">
    <header class="operations-header">
      <RouterLink class="operations-brand" to="/">Rio 운영 콘솔</RouterLink>
      <nav aria-label="주 메뉴">
        <RouterLink to="/">개요</RouterLink>
        <RouterLink to="/investigate">조사</RouterLink>
        <RouterLink to="/settings">설정</RouterLink>
      </nav>
      <div class="operations-account">
        <button
          ref="paletteTrigger"
          type="button"
          aria-label="명령 팔레트 열기"
          @click="paletteOpen = true"
        >
          명령 검색
        </button>
        <a v-if="oauthEnabled && !authActor" href="/auth/discord/login">
          Discord 로그인
        </a>
        <template v-else-if="authActor">
          <span>{{ authActor.role === "admin" ? "관리자" : "열람자" }}</span>
          <button type="button" @click="logout">로그아웃</button>
        </template>
      </div>
    </header>

    <main v-if="route.name === 'ops-overview'" class="operations-main">
      <section class="operations-section" aria-labelledby="ops-status">
        <div class="operations-section-header">
          <h1 id="ops-status">봇 상태</h1>
          <p>
            마지막 정상 갱신 {{ formatKst(store.lastStatusAt) }} ·
            <RouterLink :to="{ path: '/settings', query: { view: 'recovery' } }"
              >상태 및 복구</RouterLink
            >
          </p>
        </div>
        <p v-if="store.statusError" role="status" class="ops-notice">
          상태 갱신 실패{{ store.status ? " · 마지막 확인값 표시" : "" }}
        </p>
        <dl class="operations-status">
          <div>
            <dt>실행</dt>
            <dd>
              <StatusBadge
                :label="
                  store.status
                    ? store.status.online
                      ? '실행 중'
                      : '중지'
                    : '미수집'
                "
                :severity="store.status?.online ? 'normal' : 'attention'"
              />
            </dd>
          </div>
          <div>
            <dt>Discord 연결</dt>
            <dd>
              {{
                store.status?.runtime?.latency_ms == null
                  ? "미수집"
                  : `지연 ${store.status.runtime.latency_ms} ms`
              }}
            </dd>
          </div>
          <div>
            <dt>응답</dt>
            <dd>{{ store.status?.runtime?.model ?? "미수집" }}</dd>
          </div>
          <div>
            <dt>운영 버전</dt>
            <dd>
              {{
                deploymentRows
                  .find((row) => row.component === "bot")
                  ?.running_revision?.slice(0, 12) ?? "미수집"
              }}
            </dd>
          </div>
        </dl>
      </section>

      <div class="operations-columns">
        <div>
          <section class="operations-section" aria-labelledby="ops-failures">
            <div class="operations-section-header">
              <h2 id="ops-failures">최근 실패</h2>
            </div>
            <p
              v-if="store.status?.events_error || store.statusError"
              class="ops-notice"
            >
              이벤트 수집 오류{{
                failures.length ? " · 마지막 확인값 표시" : ""
              }}
            </p>
            <table v-if="failures.length">
              <thead>
                <tr>
                  <th>발생 시각</th>
                  <th>원인</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in failures" :key="index">
                  <td>{{ formatKst(item.at) }}</td>
                  <td>
                    {{ item.diagnosis }}
                    <RouterLink
                      v-if="item.turnId"
                      :to="{
                        path: '/investigate',
                        query: { turn: item.turnId },
                      }"
                      :aria-label="`Trace 열기 · ${formatKst(item.at)}`"
                      >Trace</RouterLink
                    >
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else>
              {{
                store.status && !store.status.events_error && !store.statusError
                  ? "수집 범위에서 0건"
                  : "미수집"
              }}
            </p>
          </section>

          <section class="operations-section" aria-labelledby="ops-activity">
            <h2 id="ops-activity">최근 활동</h2>
            <ul v-if="activity.length" class="operations-activity">
              <li v-for="(item, index) in activity" :key="index">
                <span>{{ activityLabel(item.event) }}</span
                ><time>{{ formatKst(item.at) }}</time>
              </li>
            </ul>
            <p v-else>
              {{
                store.status && !store.status.events_error && !store.statusError
                  ? "수집 범위에서 0건"
                  : "미수집"
              }}
            </p>
          </section>
        </div>

        <div>
          <section class="operations-section" aria-labelledby="ops-deployments">
            <div class="operations-section-header">
              <h2 id="ops-deployments">배포 상태</h2>
              <p>
                마지막 정상 갱신 {{ formatKst(store.lastDeploymentsAt) }} ·
                <RouterLink
                  :to="{ path: '/settings', query: { view: 'deployment' } }"
                  >배포 상세</RouterLink
                >
              </p>
            </div>
            <p v-if="store.deploymentsError" role="status" class="ops-notice">
              배포 갱신 실패{{
                deploymentRows.length ? " · 마지막 확인값 표시" : ""
              }}
            </p>
            <table v-if="deploymentRows.length">
              <thead>
                <tr>
                  <th>서비스</th>
                  <th>상태</th>
                  <th>실행 버전</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in deploymentRows" :key="item.component">
                  <td>{{ item.component }}</td>
                  <td>
                    <StatusBadge
                      :label="item.status"
                      :severity="
                        item.status === 'succeeded'
                          ? 'normal'
                          : item.status === 'failed'
                            ? 'alert'
                            : 'attention'
                      "
                    />
                  </td>
                  <td>{{ item.running_revision?.slice(0, 12) ?? "미수집" }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else>
              {{
                store.deployments && !store.deploymentsError
                  ? "배포 기록 0건"
                  : "미수집"
              }}
            </p>
          </section>

          <section class="operations-section" aria-labelledby="ops-usage">
            <div class="operations-section-header">
              <h2 id="ops-usage">사용량</h2>
              <p>최근 24시간</p>
            </div>
            <p
              v-if="usageError || usage?.source_status === 'UNAVAILABLE'"
              class="ops-notice"
            >
              사용량 갱신 실패{{
                usage?.groups.length ? " · 마지막 확인값 표시" : ""
              }}
            </p>
            <p
              v-else-if="
                usage?.source_status === 'STALE' ||
                usage?.coverage?.history_limited ||
                usage?.coverage?.truncated
              "
              class="ops-notice"
            >
              {{
                usage?.source_status === "STALE" ? "이전 수집값" : "일부 수집"
              }}
              · 마지막 정상 갱신 {{ formatKst(usage?.source.last_success_at) }}
            </p>
            <p
              v-if="
                usage &&
                (usage.source_status !== 'UNAVAILABLE' || usage.groups.length)
              "
            >
              요청 {{ usageTotals.calls }}건 · 오류 {{ usageTotals.errors }}건
            </p>
            <p v-else>미수집</p>
          </section>
        </div>
      </div>
    </main>
    <main v-else-if="route.name === 'ops-investigate'" class="operations-main">
      <h1>조사</h1>
      <nav class="operations-secondary" aria-label="조사 데이터">
        <RouterLink
          v-for="[id, label] in investigation"
          :key="id"
          :to="{
            path: '/investigate',
            query: id === 'traces' ? {} : { view: id },
          }"
          :aria-current="activeInvestigation === id ? 'page' : undefined"
          aria-current-value="false"
          >{{ label }}</RouterLink
        >
      </nav>
      <MonitorPanel
        v-if="activePanel"
        :key="activePanel"
        inline
        workspace
        :can-manage="canManage"
        :can-read-memory-content="canManage"
        :current-actor-id="authActor?.id"
        @close="closePanel"
      />
    </main>

    <main v-else class="operations-main">
      <h1>설정</h1>
      <nav class="operations-secondary" aria-label="설정 종류">
        <RouterLink
          v-for="[id, label] in settingsSections"
          :key="id"
          :to="{
            path: '/settings',
            query: id === 'runtime' ? {} : { view: id },
          }"
          :aria-current="id === activeSetting ? 'page' : undefined"
          aria-current-value="false"
          >{{ label }}</RouterLink
        >
      </nav>
      <MonitorPanel
        v-if="activePanel"
        :key="activePanel"
        inline
        workspace
        :can-manage="canManage"
        @close="closePanel"
      />
      <SettingsPanel
        v-else
        workspace
        :can-manage-presence="canManage"
        @close="closePanel"
      />
    </main>
    <CommandPalette
      :open="paletteOpen"
      @close="closePalette"
      @select="openPanel"
      @settings="router.push('/settings')"
    />
  </div>
</template>

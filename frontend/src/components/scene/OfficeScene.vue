<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import {
  rioDialogues,
  rioExpressions,
  type RioDialogue,
} from "../../data/rio-dialogues";
import type { MonitorId, MonitorStatus, SceneState } from "../../types/api";
import type { Situation } from "../../domain/situation";
import ActionCard from "../command/ActionCard.vue";
import RioBriefing from "./RioBriefing.vue";
import RioCharacter from "./RioCharacter.vue";
import SceneLayers from "./SceneLayers.vue";

const props = defineProps<{
  scene: SceneState;
  monitors: Record<MonitorId, MonitorStatus>;
  selected: MonitorId | null;
  message: string;
  detail: string;
  situation: Situation;
}>();

const emit = defineEmits<{
  select: [id: MonitorId];
  dismissPanel: [];
  selectLogs: [];
  console: [];
}>();

const root = ref<HTMLElement | null>(null);
const time = ref("--:--:-- KST");
let clockTimer: number | undefined;
const dialogueOpen = ref(false);
const dialogueIndex = ref(0);
const controlMenuOpen = ref(false);

const linkLabel = computed(() => props.monitors.link.summary);
const controlItems = computed(() =>
  Object.values(props.monitors).sort((left, right) => {
    const priority = { alert: 0, attention: 1, normal: 2 } as const;
    return priority[left.severity] - priority[right.severity];
  }),
);
const currentDialogue = computed<RioDialogue>(() => {
  if (dialogueIndex.value === 0) {
    return {
      image: rioExpressions[0],
      message: props.message,
      detail: props.detail,
    };
  }
  return rioDialogues[dialogueIndex.value - 1];
});

function updateClock(): void {
  time.value =
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date()) + " KST";
}

async function focusMonitor(id: MonitorId): Promise<void> {
  controlMenuOpen.value = true;
  await nextTick();
  root.value?.querySelector<HTMLElement>(`[data-monitor="${id}"]`)?.focus();
}

function closeDialogue(): void {
  dialogueOpen.value = false;
}

function advanceDialogue(): void {
  dialogueIndex.value = (dialogueIndex.value + 1) % rioExpressions.length;
}

function interactWithRio(): void {
  if (!dialogueOpen.value) {
    dialogueIndex.value = 0;
    dialogueOpen.value = true;
    controlMenuOpen.value = false;
    emit("dismissPanel");
    return;
  }
  advanceDialogue();
}

function selectMonitor(id: MonitorId): void {
  controlMenuOpen.value = false;
  closeDialogue();
  emit("select", id);
}

function inspectSituation(): void {
  if (props.situation.recommendedMonitor) {
    selectMonitor(props.situation.recommendedMonitor);
  }
}

function viewSituationLogs(): void {
  controlMenuOpen.value = false;
  closeDialogue();
  emit("selectLogs");
}

function dismissFromBackground(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("button, a, input, select, textarea, [role='dialog']"))
    return;
  controlMenuOpen.value = false;
  closeDialogue();
  emit("dismissPanel");
}

defineExpose({ focusMonitor, closeDialogue });

onMounted(() => {
  updateClock();
  clockTimer = window.setInterval(updateClock, 1000);
});

onUnmounted(() => window.clearInterval(clockTimer));
</script>

<template>
  <section
    ref="root"
    class="office-scene"
    :data-scene="scene"
    aria-label="Rio Operations Room"
  >
    <div class="office-stage" @click="dismissFromBackground">
      <SceneLayers :scene="scene" />
      <div class="scene-shade" aria-hidden="true"></div>
      <header class="scene-hud">
        <div class="hud-block brand-block">
          <span>RIO OFFICE</span>
          <strong>CT-101 BOT / DATA LINK</strong>
        </div>
        <div class="hud-block status-block">
          <span>{{ time }}</span>
          <strong>{{ linkLabel }}</strong>
          <button
            type="button"
            class="office-console-switch"
            @click="$emit('console')"
          >
            CONSOLE MODE
          </button>
        </div>
      </header>
      <Transition name="action-card">
        <ActionCard
          v-if="
            situation.level === 'action-required' ||
            situation.level === 'advisory'
          "
          :situation="situation"
          @inspect="inspectSituation"
          @logs="viewSituationLogs"
        />
      </Transition>
      <div class="control-dock">
        <button
          type="button"
          class="control-dock-trigger"
          aria-controls="control-dock-menu"
          :aria-expanded="controlMenuOpen"
          @click="controlMenuOpen = !controlMenuOpen"
        >
          CONTROL PANEL
        </button>
        <Transition name="control-menu">
          <nav
            v-if="controlMenuOpen"
            id="control-dock-menu"
            class="control-dock-menu"
            aria-label="관제 메뉴"
          >
            <button
              v-for="monitor in controlItems"
              :key="monitor.id"
              type="button"
              :class="{
                attention: monitor.badge || monitor.severity !== 'normal',
              }"
              :data-monitor="monitor.id"
              :aria-label="`${monitor.label}: ${monitor.summary}`"
              aria-controls="monitor-panel"
              @click="selectMonitor(monitor.id)"
            >
              <span>{{ monitor.label }}</span>
              <small>{{ monitor.summary }}</small>
            </button>
          </nav>
        </Transition>
      </div>
      <RioCharacter
        :scene="scene"
        :expression="currentDialogue.image"
        :dialogue-open="dialogueOpen"
        @interact="interactWithRio"
      />
      <Transition name="rio-dialogue">
        <RioBriefing
          v-if="dialogueOpen"
          :message="currentDialogue.message"
          :detail="currentDialogue.detail"
          @next="advanceDialogue"
          @close="closeDialogue"
        />
      </Transition>
    </div>
  </section>
</template>

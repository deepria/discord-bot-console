import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it } from "vitest";
import { recentTurnErrors } from "../../src/domain/recentErrors";
import SystemPanel from "../../src/components/panels/SystemPanel.vue";
import { useOperationsStore } from "../../src/stores/operations";
import type { BotStatus, RuntimeEvent } from "../../src/types/api";
const healthy: BotStatus = {
  online: true,
  pid: 1,
  memory_mb: 1,
  cpu_percent: 0,
  uptime_seconds: 10,
  runtime: null,
  events: [],
  events_error: null,
};
function failure(i: number): RuntimeEvent {
  return {
    at: `2026-10-20T01:00:0${i}Z`,
    event: "turn.failed",
    turn_id: `turn-${i}`,
    error_type: `Failure${i}`,
  };
}
describe("recent response failures", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("selects five newest distinct turns without mutating the window", () => {
    const events = [
      failure(4),
      failure(1),
      failure(6),
      failure(2),
      failure(3),
      failure(5),
      { ...failure(6), event: "turn_failed" },
      {
        ...failure(7),
        event: "structured_memory_shadow",
        rejected: { policy: 1 },
      },
    ];
    const original = structuredClone(events);
    expect(recentTurnErrors(events).map((e) => e.diagnosis)).toEqual(
      [6, 5, 4, 3, 2].map((i) => `TURN FAILED · Failure${i}`),
    );
    expect(events).toEqual(original);
  });
  it("handles missing turn IDs and invalid dates without exposing arbitrary fields", () => {
    expect(
      recentTurnErrors([
        {
          at: "bad time",
          event: "turn_failed",
          error_type: "private content",
          message: "SECRET",
        },
        {
          at: null,
          event: "turn.failed",
          user_id: "SECRET",
          provider_error_message: "SECRET",
        },
        {
          at: "2026-10-20T01:00:00Z",
          event: "turn_failed",
          error_type: "ReadTimeout",
          provider: "gemini",
        },
      ]),
    ).toEqual([
      { at: "2026-10-20T01:00:00Z", diagnosis: "GEMINI · READ TIMEOUT" },
      { at: null, diagnosis: "TURN FAILED" },
      { at: null, diagnosis: "TURN FAILED" },
    ]);
  });
  it("distinguishes unavailable, checked-empty and stale windows and opens events", async () => {
    const store = useOperationsStore();
    const wrapper = mount(SystemPanel, {
      global: { stubs: { ConfirmDialog: true } },
    });
    const section = () => wrapper.get('[aria-label="최근 응답 오류"]');
    expect(section().text()).toContain("오류 이벤트를 확인할 수 없습니다");
    expect(section().text()).not.toContain("응답 오류가 없습니다");
    store.status = { ...healthy };
    await nextTick();
    expect(section().text()).toContain("최근 수신 범위에 응답 오류가 없습니다");
    store.stale = true;
    await nextTick();
    expect(section().text()).toContain("최신 오류 여부를 확인할 수 없습니다");
    expect(section().text()).not.toContain("응답 오류가 없습니다");
    store.status = { ...healthy, events: [failure(1)] };
    await nextTick();
    expect(section().text()).toContain("Failure1");
    store.status = { ...healthy, events_error: "event source unavailable" };
    store.stale = false;
    await nextTick();
    expect(section().text()).toContain("event source unavailable");
    expect(section().text()).not.toContain("응답 오류가 없습니다");
    await section().get("button").trigger("click");
    expect(store.selectedMonitor).toBe("events");
    wrapper.unmount();
  });
});

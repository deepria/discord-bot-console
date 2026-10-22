import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Coverage from "../../src/components/panels/TelemetryCoverage.vue";
import TracePanel from "../../src/components/panels/TracePanel.vue";
import UsagePanel from "../../src/components/panels/UsagePanel.vue";
import { api } from "../../src/services/api";
import { useOperationsStore } from "../../src/stores/operations";
import type { TelemetryCoverage, UsageResponse } from "../../src/types/api";

const coverage = (extra = {}): TelemetryCoverage => ({
  mode: "retained",
  retention_days: 90,
  collection_started_at: "2026-10-22T00:00:00Z",
  oldest_at: null,
  newest_at: null,
  truncated: false,
  history_limited: true,
  cleanup_pending: false,
  ...extra,
});
const source = {
  status: "HEALTHY" as const,
  last_success_at: null,
  error_code: null,
};
const usage = (extra = {}): UsageResponse => ({
  source,
  source_status: "HEALTHY",
  group_by: "provider",
  groups: [],
  coverage: coverage(),
  ...extra,
});
beforeEach(() => setActivePinia(createPinia()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("distinguishes legacy/unknown, short collection and partial results", () => {
  expect(mount(Coverage).text()).toContain("확인할 수 없습니다");
  const legacy = mount(Coverage, {
    props: { coverage: coverage({ mode: "legacy_tail" }) },
  });
  expect(legacy.text()).toContain("최근 로그 일부만");
  const current = mount(Coverage, {
    props: { coverage: coverage({ truncated: true, cleanup_pending: true }) },
  });
  expect(current.text()).toContain("보존 시작 전");
  expect(current.text()).toContain("일부 자료만");
  expect(current.text()).toContain("저장소 정리가 대기 중");
  expect(current.text()).toContain("현재 보존 기록이 없습니다");
});

it("validates coverage rather than silently accepting a false complete response", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify(usage({ coverage: coverage({ truncated: "false" }) })),
        ),
      ),
  );
  await expect(api.getUsage()).rejects.toThrow("coverage");
});

it("supports 90 days and reports missing token counts", async () => {
  const get = vi.spyOn(api, "getUsage").mockResolvedValue(
    usage({
      groups: [
        {
          provider: "gemini",
          calls: 2,
          errors: 0,
          total_tokens: 5,
          unknown_token_calls: 1,
          success_rate: 1,
          p50_latency_ms: null,
          p95_latency_ms: null,
        },
      ],
    }),
  );
  const panel = mount(UsagePanel);
  await flushPromises();
  await panel.findAll("select")[0]!.setValue(2160);
  await flushPromises();
  expect(get).toHaveBeenLastCalledWith(2160, "provider");
  expect(panel.text()).toContain("token 미확인 1건");
});

it("keeps the latest Usage filter result when an older request finishes late", async () => {
  let finish!: (value: UsageResponse) => void;
  vi.spyOn(api, "getUsage")
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(usage({ group_by: "model" }));
  const store = useOperationsStore();
  const first = store.refreshUsage(24, "provider");
  await store.refreshUsage(2160, "model");
  finish(usage());
  await first;
  expect(store.usage?.group_by).toBe("model");
});

it("paginates traces with a fixed query window", async () => {
  const get = vi
    .spyOn(api, "getTraces")
    .mockResolvedValueOnce({
      source,
      source_status: "HEALTHY",
      traces: [{ turn_id: "one", event: "turn.completed" }],
      next_cursor: "next",
      coverage: coverage({ retention_days: 30 }),
    })
    .mockResolvedValueOnce({
      source,
      source_status: "HEALTHY",
      traces: [{ turn_id: "two", event: "turn.failed" }],
      next_cursor: null,
    });
  vi.spyOn(api, "getTrace").mockResolvedValue([]);
  const panel = mount(TracePanel);
  await flushPromises();
  const initial = get.mock.calls[0]![1]!;
  await panel
    .findAll("button")
    .find((b) => b.text() === "다음 기록")!
    .trigger("click");
  await flushPromises();
  expect(get.mock.calls[1]![1]).toEqual({ ...initial, cursor: "next" });
  expect(useOperationsStore().traces?.traces).toHaveLength(2);
  expect(panel.text()).not.toContain("표시할 turn trace가 없습니다");
});

it("passes a 90-day Usage request without clamping it to 31 days", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(usage())));
  vi.stubGlobal("fetch", fetch);
  await api.getUsage(2160);
  expect(fetch.mock.calls[0]![0]).toContain("window_hours=2160");
});

it("does not label the previous Usage period as the new period after a failed filter change", async () => {
  vi.spyOn(api, "getUsage")
    .mockResolvedValueOnce(usage())
    .mockRejectedValueOnce(new Error("new period failed"));
  const store = useOperationsStore();
  await store.refreshUsage(24);
  expect(store.usage).not.toBeNull();
  await store.refreshUsage(2160);
  expect(store.usage).toBeNull();
  expect(store.usageError).toBe("new period failed");
});

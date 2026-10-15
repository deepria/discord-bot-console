import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MemoryPanel from "../../src/components/panels/MemoryPanel.vue";
import { api } from "../../src/services/api";
import { useOperationsStore } from "../../src/stores/operations";
import { memoryEvaluationFixture } from "../fixtures/memoryEvaluation";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Memory evaluation API", () => {
  it("reads and validates aggregate metadata", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(memoryEvaluationFixture())),
      );
    vi.stubGlobal("fetch", fetch);
    const value = await api.getMemoryEvaluation();
    expect(value.evaluation.items.active).toBe(38);
    expect(fetch.mock.calls[0]![0]).toBe("/api/memory/evaluation");
  });

  it.each([
    "missing-count",
    "negative",
    "false-ready",
    "unknown-reason",
    "bad-time",
  ])("rejects %s instead of showing a healthy zero", async (change) => {
    const value = memoryEvaluationFixture();
    if (change === "missing-count")
      Reflect.deleteProperty(value.evaluation.items, "active");
    if (change === "negative") value.evaluation.items.active = -1;
    if (change === "false-ready")
      value.evaluation.readiness.ready_for_metadata_review = true;
    if (change === "unknown-reason")
      value.evaluation.readiness.reasons = ["private data"];
    if (change === "bad-time") value.checked_at = "invalid";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(value))),
    );
    await expect(api.getMemoryEvaluation()).rejects.toThrow("응답 형식");
  });
});

describe("Memory evaluation panel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(api, "getMemory").mockResolvedValue({
      source_status: "HEALTHY",
      memory: [],
      next_cursor: null,
    });
  });

  it("shows sample progress and fixed reasons without implying retrieval is enabled", async () => {
    vi.spyOn(api, "getMemoryEvaluation").mockResolvedValue(
      memoryEvaluationFixture(),
    );
    const wrapper = mount(MemoryPanel);
    await flushPromises();
    expect(wrapper.text()).toContain("평가 자료 수집 중");
    expect(wrapper.text()).toContain("38 / 50건");
    expect(wrapper.text()).toContain("활성 표본을 더 수집해야 합니다");
    expect(wrapper.text()).toContain("자동으로 켜지지 않습니다");
    expect(wrapper.findAll("button")).toHaveLength(1);
  });

  it("retains the previous snapshot as stale after a failed refresh", async () => {
    const get = vi
      .spyOn(api, "getMemoryEvaluation")
      .mockResolvedValue(memoryEvaluationFixture());
    const wrapper = mount(MemoryPanel);
    await flushPromises();
    get.mockRejectedValueOnce(new Error("Memory 평가 연결 실패"));
    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("STALE · 마지막 조회 결과");
    expect(wrapper.text()).toContain("38 / 50건");
    expect(wrapper.text()).toContain("Memory 평가 연결 실패");
  });

  it("does not invent counts when no snapshot is available", async () => {
    vi.spyOn(api, "getMemoryEvaluation").mockRejectedValue(
      new Error("조회 실패"),
    );
    const wrapper = mount(MemoryPanel);
    await flushPromises();
    expect(wrapper.text()).toContain("평가 정보 확인 불가");
    expect(wrapper.text()).not.toContain("0 / 50");
  });

  it("never labels a stale source ready even if screening passed", async () => {
    const fixture = memoryEvaluationFixture();
    fixture.source.status = "STALE";
    fixture.evaluation.readiness.ready_for_metadata_review = true;
    fixture.evaluation.readiness.reasons = [];
    fixture.evaluation.items.total = fixture.evaluation.items.active = 50;
    fixture.evaluation.provenance.active_message_linked =
      fixture.evaluation.provenance.active_turn_linked = 50;
    vi.spyOn(api, "getMemoryEvaluation").mockResolvedValue(fixture);
    const wrapper = mount(MemoryPanel);
    await flushPromises();
    expect(wrapper.text()).toContain("STALE");
    expect(wrapper.text()).not.toContain("Metadata 검토 준비됨");
  });

  it("only announces metadata review when a healthy report passes screening", async () => {
    const fixture = memoryEvaluationFixture();
    fixture.evaluation.items.total = fixture.evaluation.items.active = 50;
    fixture.evaluation.provenance.active_message_linked =
      fixture.evaluation.provenance.active_turn_linked = 50;
    fixture.evaluation.readiness.ready_for_metadata_review = true;
    fixture.evaluation.readiness.reasons = [];
    vi.spyOn(api, "getMemoryEvaluation").mockResolvedValue(fixture);
    const wrapper = mount(MemoryPanel);
    await flushPromises();
    expect(wrapper.text()).toContain("Metadata 검토 준비됨");
    expect(wrapper.text()).toContain("자동으로 켜지지 않습니다");
    expect(wrapper.findAll("button")).toHaveLength(1);
  });

  it("avoids duplicate evaluation requests while loading", async () => {
    const fixture = memoryEvaluationFixture();
    let finish!: (value: typeof fixture) => void;
    const get = vi.spyOn(api, "getMemoryEvaluation").mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const store = useOperationsStore();
    const first = store.refreshMemory();
    await store.refreshMemory();
    expect(get).toHaveBeenCalledTimes(1);
    finish(fixture);
    await first;
    expect(store.memoryEvaluationLoading).toBe(false);
  });
});

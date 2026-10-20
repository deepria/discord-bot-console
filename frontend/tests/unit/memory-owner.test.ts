import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../../src/services/api";
import MemoryPanel from "../../src/components/panels/MemoryPanel.vue";
import { useOperationsStore } from "../../src/stores/operations";
import { memoryDetailFixture } from "../fixtures/memoryDetail";
import { memoryEvaluationFixture } from "../fixtures/memoryEvaluation";
import type { MemoryResponse } from "../../src/types/api";

function response(
  owner = "99",
  id = 1,
  cursor: number | null = null,
): MemoryResponse {
  return {
    source_status: "HEALTHY",
    next_cursor: cursor,
    memory: [
      {
        id,
        owner_id: owner,
        kind: "fact",
        disclosure: "owner_private",
        confidence: 0.8,
        created_at: "2026-10-01T12:00:00Z",
      },
    ],
  };
}
beforeEach(() => setActivePinia(createPinia()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("encodes owner and cursor in the public metadata request", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(response("88"))));
  vi.stubGlobal("fetch", fetch);
  await api.getMemory("88", 10);
  expect(fetch.mock.calls[0]![0]).toBe(
    "/api/memory?limit=50&owner_id=88&cursor=10",
  );
});

it("ignores a late response from the previously selected owner", async () => {
  let resolve!: (value: MemoryResponse) => void;
  vi.spyOn(api, "getMemory").mockImplementation((owner) =>
    owner === "99"
      ? new Promise((r) => {
          resolve = r;
        })
      : Promise.resolve(response("88", 2)),
  );
  const store = useOperationsStore();
  const old = store.setMemoryOwnerFilter("99");
  await store.setMemoryOwnerFilter("88");
  resolve(response("99"));
  await old;
  expect(store.memory?.memory[0]?.owner_id).toBe("88");
  expect(store.memoryOwnerFilter).toBe("88");
});

it("keeps the owner filter when loading the next page", async () => {
  const get = vi
    .spyOn(api, "getMemory")
    .mockResolvedValueOnce(response("88", 3, 3))
    .mockResolvedValueOnce(response("88", 2));
  const store = useOperationsStore();
  await store.setMemoryOwnerFilter("88");
  await store.loadMoreMemory();
  expect(get).toHaveBeenLastCalledWith("88", 3);
  expect(store.memory?.memory.map((x) => x.id)).toEqual([3, 2]);
});

it("labels owners next to content and clears the body on owner change", async () => {
  vi.spyOn(api, "getMemory").mockImplementation((owner) =>
    Promise.resolve(
      owner
        ? response(owner, 2)
        : {
            ...response(),
            memory: [...response().memory, ...response("88", 2).memory],
          },
    ),
  );
  vi.spyOn(api, "getMemoryEvaluation").mockResolvedValue(
    memoryEvaluationFixture(),
  );
  vi.spyOn(api, "getMemoryDetail").mockResolvedValue(memoryDetailFixture());
  const wrapper = mount(MemoryPanel, {
    props: { canReadContent: true, currentActorId: "99" },
  });
  await flushPromises();
  expect(wrapper.text()).toContain("내 기억 · ID 99");
  expect(wrapper.text()).toContain("사용자 기억 · ID 88");
  await wrapper.get('[aria-label="기억 후보 1 내용 보기"]').trigger("click");
  await flushPromises();
  expect(wrapper.text()).toContain("간결한 답변을 선호한다.");
  await wrapper.get('[aria-label="기억 소유자"]').setValue("88");
  await flushPromises();
  expect(wrapper.text()).not.toContain("간결한 답변을 선호한다.");
  expect(api.getMemory).toHaveBeenLastCalledWith("88", undefined);
  expect(api.getMemoryDetail).toHaveBeenCalledTimes(1);
  wrapper.unmount();
});

it("rejects an unfiltered response rather than showing another owner's entries", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(response("99")))),
  );
  await expect(api.getMemory("88")).rejects.toThrow(
    "선택한 사용자와 기억 목록이 일치하지 않습니다.",
  );
});

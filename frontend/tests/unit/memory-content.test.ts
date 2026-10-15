import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MemoryPanel from "../../src/components/panels/MemoryPanel.vue";
import { api } from "../../src/services/api";
import { memoryDetailFixture } from "../fixtures/memoryDetail";
import { memoryEvaluationFixture } from "../fixtures/memoryEvaluation";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Memory content client", () => {
  it("interprets SQLite list timestamps as UTC to match detail timestamps", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            source_status: "HEALTHY",
            next_cursor: null,
            memory: [
              {
                id: 1,
                owner_id: "99",
                kind: "fact",
                disclosure: "owner_private",
                confidence: 0.9,
                created_at: "2026-10-01 12:00:00",
              },
            ],
          }),
        ),
      ),
    );
    expect((await api.getMemory()).memory[0]!.created_at).toBe(
      "2026-10-01T12:00:00Z",
    );
  });
  it("explicitly asks for content without sending a browser actor claim", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(memoryDetailFixture())));
    vi.stubGlobal("fetch", fetch);
    expect((await api.getMemoryDetail(1)).memory.content).toBe(
      "간결한 답변을 선호한다.",
    );
    expect(fetch.mock.calls[0]![0]).toBe("/api/memory/1?include_content=true");
  });

  it.each(["missing-content", "wrong-item", "unsafe-url"])(
    "rejects %s",
    async (change) => {
      const value = memoryDetailFixture();
      if (change === "missing-content")
        Reflect.deleteProperty(value.memory, "content");
      if (change === "wrong-item") value.memory.id = 2;
      if (change === "unsafe-url")
        value.memory.sources[0]!.message_url = "javascript:alert(1)";
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(value))),
      );
      await expect(api.getMemoryDetail(1)).rejects.toThrow();
    },
  );

  it("uses code points for the stored 600-character limit", async () => {
    const value = memoryDetailFixture();
    value.memory.content = "😀".repeat(600);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(value))),
    );
    expect((await api.getMemoryDetail(1)).memory.content).toBe(
      value.memory.content,
    );
  });
});

describe("Memory content inspection", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(api, "getMemory").mockResolvedValue({
      source_status: "HEALTHY",
      next_cursor: null,
      memory: [
        {
          id: 1,
          owner_id: "99",
          kind: "preference",
          disclosure: "owner_private",
          confidence: 0.9,
          created_at: "2026-10-01T12:00:00Z",
        },
      ],
    });
    vi.spyOn(api, "getMemoryEvaluation").mockResolvedValue(
      memoryEvaluationFixture(),
    );
  });

  it("reads on explicit selection and clears the detail when closed", async () => {
    const read = vi
      .spyOn(api, "getMemoryDetail")
      .mockResolvedValue(memoryDetailFixture());
    const wrapper = mount(MemoryPanel, { props: { canReadContent: true } });
    await flushPromises();
    expect(read).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain("간결한 답변을 선호한다.");
    await wrapper.get('[aria-label="기억 후보 1 내용 보기"]').trigger("click");
    await flushPromises();
    expect(read).toHaveBeenCalledWith(1);
    expect(wrapper.text()).toContain("간결한 답변을 선호한다.");
    expect(wrapper.text()).toContain("연결 누락 — 확인 필요");
    expect(wrapper.text()).toContain("미사용 · 수집·평가 중인 후보");
    expect(
      wrapper
        .get('a[href="https://discord.com/channels/10/20/100"]')
        .attributes("rel"),
    ).toContain("noopener");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "내용 닫기")!
      .trigger("click");
    expect(wrapper.text()).not.toContain("간결한 답변을 선호한다.");
  });

  it("prevents viewer reads", async () => {
    const read = vi.spyOn(api, "getMemoryDetail");
    const wrapper = mount(MemoryPanel, { props: { canReadContent: false } });
    await flushPromises();
    expect(
      wrapper
        .get('[aria-label="기억 후보 1 내용 보기"]')
        .attributes("disabled"),
    ).toBeDefined();
    expect(read).not.toHaveBeenCalled();
  });

  it("discards a late response after logout", async () => {
    let finish!: (value: ReturnType<typeof memoryDetailFixture>) => void;
    vi.spyOn(api, "getMemoryDetail").mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const wrapper = mount(MemoryPanel, { props: { canReadContent: true } });
    await flushPromises();
    await wrapper.get('[aria-label="기억 후보 1 내용 보기"]').trigger("click");
    await wrapper.setProps({ canReadContent: false });
    finish(memoryDetailFixture());
    await flushPromises();
    expect(wrapper.text()).not.toContain("간결한 답변을 선호한다.");
    expect(wrapper.find('[aria-label="기억 후보 내용"]').exists()).toBe(false);
  });

  it("renders stored text literally and clears it on a failed reread", async () => {
    const fixture = memoryDetailFixture();
    fixture.memory.content = '<img src=x onerror="alert(1)">';
    const read = vi.spyOn(api, "getMemoryDetail").mockResolvedValue(fixture);
    const wrapper = mount(MemoryPanel, { props: { canReadContent: true } });
    await flushPromises();
    await wrapper.get('[aria-label="기억 후보 1 내용 보기"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain(fixture.memory.content);
    expect(wrapper.find("img").exists()).toBe(false);
    read.mockRejectedValueOnce(new Error("상세 열람 권한이 만료됐습니다."));
    await wrapper.get('[aria-label="기억 후보 1 내용 보기"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).not.toContain(fixture.memory.content);
    expect(wrapper.text()).toContain("상세 열람 권한이 만료됐습니다.");
  });
});

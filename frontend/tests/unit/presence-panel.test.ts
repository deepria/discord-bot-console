import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it } from "vitest";
import PresencePanel from "../../src/components/panels/PresencePanel.vue";
import { useOperationsStore } from "../../src/stores/operations";
import { presenceFixture } from "../fixtures/presence";

describe("Presence panel draft", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("preserves an edited draft across polling, including after a previous success", async () => {
    const store = useOperationsStore();
    const fixture = presenceFixture();
    fixture.operation = {
      request_id: "old-request",
      state: "success",
      error: null,
      completed_at: null,
    };
    store.presence = fixture;
    store.presenceResult = "Discord Presence 전송과 설정 저장을 완료했습니다.";
    const wrapper = mount(PresencePanel, {
      props: { canManage: true },
      global: { stubs: { ConfirmDialog: true } },
    });
    await wrapper.get("#presence-text").setValue("새로운 입력");
    store.presence = structuredClone(fixture);
    await nextTick();
    expect(
      (wrapper.get("#presence-text").element as HTMLInputElement).value,
    ).toBe("새로운 입력");
  });

  it("recovers the last Manual values when switching back from Auto", async () => {
    const store = useOperationsStore();
    const fixture = presenceFixture();
    fixture.configured = {
      mode: "auto",
      status: "online",
      activity_type: "playing",
      activity_text: "대기 중",
    };
    store.presence = fixture;
    const wrapper = mount(PresencePanel, {
      props: { canManage: true },
      global: { stubs: { ConfirmDialog: true } },
    });
    await wrapper.get("#presence-mode").setValue("manual");
    expect(
      (wrapper.get("#presence-status").element as HTMLSelectElement).value,
    ).toBe("dnd");
    expect(
      (wrapper.get("#presence-text").element as HTMLInputElement).value,
    ).toBe("코드 수정 중");
  });
});

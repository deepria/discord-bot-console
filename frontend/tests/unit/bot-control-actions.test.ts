import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BotControlActions from "../../src/components/command/BotControlActions.vue";
import ConfirmDialog from "../../src/components/common/ConfirmDialog.vue";
import { useOperationsStore } from "../../src/stores/operations";

describe("shared service controls", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("requires admin permission and closes an open confirmation when permission is lost", async () => {
    const store = useOperationsStore();
    const run = vi.spyOn(store, "runControl").mockResolvedValue(true);
    const wrapper = mount(BotControlActions, {
      props: { actions: ["restart"] },
      global: { stubs: { ConfirmDialog: true } },
    });
    const button = wrapper.get("button");
    expect(button.attributes("disabled")).toBeDefined();
    await wrapper.setProps({ canManage: true });
    await button.trigger("click");
    expect(wrapper.findComponent(ConfirmDialog).props("open")).toBe(true);
    await wrapper.setProps({ canManage: false });
    expect(wrapper.findComponent(ConfirmDialog).props("open")).toBe(false);
    wrapper.findComponent(ConfirmDialog).vm.$emit("confirm");
    expect(run).not.toHaveBeenCalled();
  });
  it("uses confirmation before execution and disables controls while a command is pending", async () => {
    const store = useOperationsStore();
    const run = vi.spyOn(store, "runControl").mockResolvedValue(true);
    const wrapper = mount(BotControlActions, {
      props: { canManage: true },
      global: { stubs: { ConfirmDialog: true } },
    });
    await wrapper.findAll("button")[1]!.trigger("click");
    expect(run).not.toHaveBeenCalled();
    wrapper.findComponent(ConfirmDialog).vm.$emit("confirm");
    expect(run).toHaveBeenCalledExactlyOnceWith("restart");
    store.control.state = "requesting";
    await wrapper.vm.$nextTick();
    for (const button of wrapper.findAll("button"))
      expect(button.attributes("disabled")).toBeDefined();
  });
});

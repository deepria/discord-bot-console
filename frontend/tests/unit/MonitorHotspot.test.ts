import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MonitorHotspot from "../../src/components/scene/MonitorHotspot.vue";

describe("MonitorHotspot", () => {
  it("exposes status to assistive technology and emits selection", async () => {
    const wrapper = mount(MonitorHotspot, {
      props: {
        monitor: {
          id: "system",
          label: "SYSTEM STATUS",
          severity: "alert",
          summary: "OFFLINE",
        },
        selected: false,
        x: 3,
        y: 22,
        width: 12,
        height: 18,
        tile: "/monitor-tile.webp",
      },
    });

    expect(wrapper.attributes("aria-label")).toBe("SYSTEM STATUS: OFFLINE");
    expect(wrapper.classes()).toContain("severity-alert");
    await wrapper.trigger("click");
    expect(wrapper.emitted("select")?.[0]).toEqual(["system"]);
  });
});

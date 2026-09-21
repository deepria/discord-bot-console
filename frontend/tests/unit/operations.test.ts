import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/services/api";
import { useOperationsStore } from "../../src/stores/operations";
import type { BotStatus } from "../../src/types/api";

vi.mock("../../src/services/api", () => ({
  api: {
    getStatus: vi.fn(),
    getLogs: vi.fn(),
    getDeployments: vi.fn(),
    control: vi.fn(),
  },
}));

const healthyStatus: BotStatus = {
  online: true,
  pid: 101,
  memory_mb: 82.4,
  cpu_percent: 1.3,
  uptime_seconds: 7200,
  runtime: {
    provider: "openai",
    model: "gpt-test",
    guild_count: 2,
    latency_ms: 38,
  },
  events: [{ at: "2026-09-18T00:00:00Z", event: "discord.connected" }],
  events_error: null,
};

describe("operations store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("moves from loading to healthy after a valid response", async () => {
    vi.mocked(api.getStatus).mockResolvedValue(healthyStatus);
    const store = useOperationsStore();

    expect(store.scene).toBe("loading");
    await store.refreshStatus();

    expect(store.scene).toBe("healthy");
    expect(store.monitorStatuses.system.summary).toBe("ONLINE");
    expect(store.status?.runtime?.model).toBe("gpt-test");
    expect(store.situation.level).toBe("healthy");
  });

  it("retains the last good response and marks it stale", async () => {
    vi.mocked(api.getStatus)
      .mockResolvedValueOnce(healthyStatus)
      .mockRejectedValueOnce(new Error("agent unavailable"));
    const store = useOperationsStore();

    await store.refreshStatus();
    await store.refreshStatus();

    expect(store.status?.pid).toBe(101);
    expect(store.stale).toBe(true);
    expect(store.scene).toBe("alert");
    expect(store.monitorStatuses.link.severity).toBe("alert");
    expect(store.situation.recommendedMonitor).toBe("link");
  });

  it("counts only events received after initialization", async () => {
    vi.mocked(api.getStatus)
      .mockResolvedValueOnce(healthyStatus)
      .mockResolvedValueOnce({
        ...healthyStatus,
        events: [
          ...healthyStatus.events,
          {
            at: "2026-09-18T00:00:05Z",
            event: "ai.completed",
            request_id: "req-1",
          },
        ],
      });
    const store = useOperationsStore();

    await store.refreshStatus();
    expect(store.unseenEventCount).toBe(0);
    await store.refreshStatus();
    expect(store.unseenEventCount).toBe(1);
    store.selectMonitor("events");
    expect(store.unseenEventCount).toBe(0);
  });

  it("caps the live log buffer", () => {
    const store = useOperationsStore();
    for (let index = 0; index < 805; index += 1)
      store.appendLog(`line-${index}`);

    expect(store.logs).toHaveLength(800);
    expect(store.logs[0]).toBe("line-5");
    expect(store.logs.at(-1)).toBe("line-804");
  });
});

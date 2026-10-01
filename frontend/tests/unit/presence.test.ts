import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../../src/services/api";
import { useOperationsStore } from "../../src/stores/operations";
import { presenceTextError } from "../../src/domain/presence";
import { presenceFixture } from "../fixtures/presence";

vi.mock("../../src/services/api", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/services/api")>();
  return {
    ...original,
    api: { ...original.api, getPresence: vi.fn(), setPresence: vi.fn() },
  };
});

describe("presence state", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
  });

  it("validates Unicode code points, whitespace and control characters", () => {
    expect(presenceTextError("🎮".repeat(128), 128)).toBeNull();
    expect(presenceTextError("🎮".repeat(129), 128)).not.toBeNull();
    expect(presenceTextError("  ", 128)).not.toBeNull();
    expect(presenceTextError("line\nbreak", 128)).not.toBeNull();
  });

  it("recovers queued requests after a page refresh and confirms only terminal success", async () => {
    const initial = presenceFixture();
    initial.operation = {
      request_id: "request-1",
      state: "queued",
      error: null,
      completed_at: null,
    };
    vi.mocked(api.getPresence)
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce({
        ...initial,
        operation: { ...initial.operation, state: "success" },
      });
    const store = useOperationsStore();
    await store.refreshPresence();
    expect(store.presencePending).toBe(true);
    expect(store.presenceResult).toBeNull();
    await store.refreshPresence();
    expect(api.getPresence).toHaveBeenLastCalledWith("request-1");
    expect(store.presencePending).toBe(false);
    expect(store.presenceResult).toContain("완료");
  });

  it("blocks duplicate clicks and tracks uncertain network outcomes", async () => {
    const fixture = presenceFixture();
    const store = useOperationsStore();
    vi.mocked(api.getPresence).mockResolvedValue(fixture);
    await store.refreshPresence();
    let reject!: (error: Error) => void;
    vi.mocked(api.setPresence).mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    const write = store.writePresence(fixture.manual);
    await store.writePresence(fixture.manual);
    expect(api.setPresence).toHaveBeenCalledTimes(1);
    const requestId = vi.mocked(api.setPresence).mock.calls[0]![1];
    vi.mocked(api.getPresence).mockResolvedValue({
      ...fixture,
      operation: {
        request_id: requestId,
        state: "applying",
        error: null,
        completed_at: null,
      },
    });
    reject(new ApiError("Network failed"));
    await write;
    expect(store.presencePending).toBe(true);
    expect(store.presenceResult).not.toContain("완료");
  });

  it("retains the last snapshot and disables writes when reads fail", async () => {
    vi.mocked(api.getPresence)
      .mockResolvedValueOnce(presenceFixture())
      .mockRejectedValueOnce(new ApiError("Agent unavailable", 503));
    const store = useOperationsStore();
    await store.refreshPresence();
    await store.refreshPresence();
    await store.writePresence(presenceFixture().manual);
    expect(store.presence?.configured.activity_text).toBe("코드 수정 중");
    expect(store.presenceError).toBe("Agent unavailable");
    expect(api.setPresence).not.toHaveBeenCalled();
  });

  it("shows safe server errors without claiming a failed write succeeded", async () => {
    const fixture = presenceFixture();
    vi.mocked(api.getPresence).mockResolvedValue(fixture);
    vi.mocked(api.setPresence).mockRejectedValue(
      new ApiError("허용되지 않는 설정입니다.", 422),
    );
    const store = useOperationsStore();
    await store.refreshPresence();
    await store.writePresence(fixture.manual);
    expect(store.presencePending).toBe(false);
    expect(store.presenceResult).toBe("허용되지 않는 설정입니다.");
  });
});

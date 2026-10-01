import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/services/api";
import { presenceFixture } from "../fixtures/presence";

afterEach(() => vi.unstubAllGlobals());

describe("presence API contract", () => {
  it("accepts a validated snapshot and sends snake_case with request ID", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(presenceFixture()), { status: 202 }),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await api.setPresence(presenceFixture().manual, "request-1");
    expect(result.configured.status).toBe("dnd");
    const init = fetch.mock.calls[0]![1];
    expect(JSON.parse(init.body)).toMatchObject({
      activity_type: "playing",
      request_id: "request-1",
    });
  });

  it("rejects malformed enum responses", async () => {
    const value = presenceFixture();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...value,
            configured: { ...value.configured, status: "offline" },
          }),
        ),
      ),
    );
    await expect(api.getPresence()).rejects.toThrow("invalid");
  });

  it("uses the server detail as the error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ detail: "Discord 연결이 끊겼습니다." }),
            { status: 503 },
          ),
        ),
    );
    await expect(api.getPresence()).rejects.toThrow(
      "Discord 연결이 끊겼습니다.",
    );
  });
});

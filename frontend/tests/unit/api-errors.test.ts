import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/services/api";

afterEach(() => vi.unstubAllGlobals());

describe("API error messages", () => {
  it.each([
    "<!DOCTYPE html><html><title>Cloudflare 502</title></html>",
    "upstream disconnected; internal diagnostic information",
    JSON.stringify({ detail: "<!DOCTYPE html><html>proxy failure</html>" }),
  ])("does not display an upstream diagnostic body", async (body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(body, { status: 502 })),
    );
    await expect(api.getMemoryDetail(38)).rejects.toMatchObject({
      status: 502,
      message:
        "서버 응답을 받지 못했습니다 (HTTP 502). 잠시 후 다시 시도해 주세요.",
    });
  });

  it("preserves structured server detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ detail: "Memory access audit is unavailable" }),
            { status: 503 },
          ),
        ),
    );
    await expect(api.getMemoryDetail(38)).rejects.toThrow(
      "Memory access audit is unavailable",
    );
  });

  it("handles a validation response longer than the message limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              detail: [{ msg: "invalid".repeat(100), input: "private input" }],
            }),
            { status: 422 },
          ),
        ),
    );
    await expect(api.getMemoryDetail(38)).rejects.toThrow(
      "입력값이 올바르지 않습니다.",
    );
  });
});

import { describe, expect, it } from "vitest";

import { formatEventDetails } from "./format";

describe("formatEventDetails", () => {
  it("explains provider read timeouts without exposing Discord identifiers", () => {
    expect(formatEventDetails({ event: "turn_failed", error_type: "ReadTimeout", provider: "gemini", timeout_phase: "read", user_id: "secret" }))
      .toBe("GEMINI · READ TIMEOUT");
  });

  it("removes Discord identifiers from ordinary event details", () => {
    expect(formatEventDetails({ event: "message_received", message_id: "1", guild_id: "2", scope: "guild" }))
      .toBe('{"scope":"guild"}');
  });
});

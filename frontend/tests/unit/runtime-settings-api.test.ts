import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/services/api";

const channelId = "1234567890123456789";
const channelSetting = {
  key: "always_reply_channel_ids",
  env_name: "ALWAYS_REPLY_CHANNEL_IDS",
  value: [Number(channelId)],
  display_value: channelId,
  source: "db",
  kind: "channel_ids",
  minimum: null,
  maximum: null,
  empty_allowed: true,
};
const existingSetting = {
  ...channelSetting,
  key: "chat_web_search",
  env_name: "CHAT_WEB_SEARCH",
  value: true,
  display_value: "on",
  kind: "bool",
  empty_allowed: false,
};

function mockResponse(body: unknown) {
  const fetch = vi.fn().mockResolvedValue(Response.json(body));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("runtime channel settings API", () => {
  it("keeps existing settings readable and preserves all channel ID digits", async () => {
    mockResponse({ settings: [existingSetting, channelSetting] });

    const { settings } = await api.getRuntimeSettings();
    expect(settings).toEqual([
      existingSetting,
      { ...channelSetting, value: [channelId] },
    ]);
  });

  it("reads an empty channel list from the write response", async () => {
    const fetch = mockResponse({
      ...channelSetting,
      value: [],
      display_value: "(비움)",
      changed_at: "2026-11-24T05:00:00Z",
    });

    await expect(
      api.setRuntimeSetting(channelSetting.key, "none", "request-1"),
    ).resolves.toMatchObject({ value: [], display_value: "(비움)" });
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
      value: "none",
      request_id: "request-1",
    });
  });

  it("rejects channel IDs whose display and numeric values disagree", async () => {
    mockResponse({
      settings: [{ ...channelSetting, display_value: "42" }],
    });

    await expect(api.getRuntimeSettings()).rejects.toThrow(
      "Runtime settings response contains an invalid setting.",
    );
  });
});

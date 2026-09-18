import { expect, test, type Page } from "@playwright/test";
import type { BotStatus } from "../../src/types/api";

const healthy: BotStatus = {
  online: true,
  pid: 101,
  memory_mb: 84.2,
  cpu_percent: 1.7,
  uptime_seconds: 9123,
  runtime: {
    provider: "openai",
    model: "gpt-test",
    guild_count: 3,
    latency_ms: 42,
  },
  events: [{ at: "2026-09-18T01:00:00Z", event: "discord.connected" }],
  events_error: null,
};

async function mockConsole(
  page: Page,
  status: BotStatus = healthy,
): Promise<void> {
  await page.addInitScript(() => {
    class FakeEventSource {
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        window.setTimeout(() => this.onopen?.(), 10);
        window.setTimeout(
          () =>
            this.onmessage?.(
              new MessageEvent("message", { data: "rio-bot ready" }),
            ),
          20,
        );
      }
      close() {}
    }
    Object.defineProperty(window, "EventSource", { value: FakeEventSource });
  });
  await page.route("**/api/status", (route) => route.fulfill({ json: status }));
  await page.route("**/api/logs?**", (route) =>
    route.fulfill({ json: { logs: ["boot complete"] } }),
  );
  await page.route("**/api/deployments", (route) =>
    route.fulfill({
      json: {
        console: { component: "console", state: "success", revision: "test" },
        deployments: [],
      },
    }),
  );
  await page.route("**/api/bot/**", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
}

test("opens a monitor and shows live operational data", async ({
  page,
}, testInfo) => {
  await mockConsole(page);
  await page.goto("/");

  await expect(
    page.getByText("문제없어. 시스템은 정상적으로 운영 중이야."),
  ).toBeVisible();
  await page.getByRole("button", { name: /SYSTEM STATUS: ONLINE/ }).click();
  await expect(
    page.getByRole("heading", { name: "SYSTEM STATUS" }),
  ).toBeVisible();
  await expect(page.getByText("101", { exact: true })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: testInfo.outputPath(
      `healthy-system-panel-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
  await page.getByRole("button", { name: "상세 패널 닫기" }).click();
  await expect(
    page.getByRole("heading", { name: "SYSTEM STATUS" }),
  ).toBeHidden();
});

test("uses the alert scene when the bot is offline", async ({ page }) => {
  await mockConsole(page, { ...healthy, online: false, pid: null });
  await page.goto("/");

  await expect(page.locator(".command-deck")).toHaveAttribute(
    "data-scene",
    "alert",
  );
  await expect(
    page.getByRole("button", { name: /SYSTEM STATUS: OFFLINE/ }),
  ).toBeVisible();
});

test("requires confirmation before stopping the bot", async ({ page }) => {
  await mockConsole(page);
  await page.goto("/");

  await page.getByRole("button", { name: /RIO CONTROL: AUTHORIZED/ }).click();
  await page.getByRole("button", { name: /STOP/ }).click();

  const dialog = page.getByRole("dialog", { name: "Rio Bot을 중지할까요?" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "RIO CONTROL" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /STOP/ }).click();
  const stopRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/bot/stop") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "중지 실행" }).click();
  await stopRequest;
  await expect(
    page.getByText(/SUCCESS \/ 봇 중지 요청을 완료했어/),
  ).toBeVisible();
});

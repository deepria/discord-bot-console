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

async function selectFromControlPanel(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("button", { name: "CONTROL PANEL" }).click();
  await page.getByRole("button", { name }).click();
}

async function switchToOfficeMode(page: Page): Promise<void> {
  await page.getByRole("button", { name: "OFFICE MODE" }).click();
  await expect(
    page.getByRole("button", { name: "Rio와 대화하기" }),
  ).toBeVisible();
}

test("starts in a practical console mode and preserves office mode", async ({
  page,
}) => {
  await mockConsole(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "SYSTEM HEALTHY" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Rio와 대화하기" }),
  ).toBeHidden();
  await expect(page.locator(".office-scene")).toBeHidden();

  await switchToOfficeMode(page);
  await page.getByRole("button", { name: "CONSOLE MODE" }).click();
  await expect(
    page.getByRole("heading", { name: "SYSTEM HEALTHY" }),
  ).toBeVisible();
});

test("opens a monitor and shows live operational data", async ({
  page,
}, testInfo) => {
  await mockConsole(page);
  await page.goto("/");
  await switchToOfficeMode(page);

  await expect(
    page.getByRole("button", { name: "Rio와 대화하기" }),
  ).toBeVisible();
  await selectFromControlPanel(page, /SYSTEM STATUS: ONLINE/);
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

test("opens the lower-left control panel", async ({ page }, testInfo) => {
  await mockConsole(page);
  await page.goto("/");
  await switchToOfficeMode(page);

  const trigger = page.getByRole("button", { name: "CONTROL PANEL" });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: /DEPLOY WATCH: READY/ }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(`monitor-leader-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test("opens Rio dialogue and cycles through expressions", async ({
  page,
}, testInfo) => {
  await mockConsole(page);
  await page.goto("/");
  await switchToOfficeMode(page);

  const rio = page.getByRole("button", { name: "Rio와 대화하기" });
  const portrait = rio.locator("img");
  const firstExpression = await portrait.getAttribute("src");

  await rio.click();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const dialogue = page.getByRole("dialog", { name: "Rio 대화" });
  await expect(dialogue).toBeVisible();
  await expect(
    dialogue.getByText("문제없어. 시스템은 정상적으로 운영 중이야."),
  ).toBeVisible();

  await dialogue.getByRole("button", { name: "다음 대화 보기" }).click();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(portrait).not.toHaveAttribute("src", firstExpression ?? "");
  await expect(
    dialogue.getByText(/관제 데이터는 제가 계속 확인/),
  ).toBeVisible();
  await page.waitForTimeout(180);
  await page.screenshot({
    path: testInfo.outputPath(`rio-dialogue-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await dialogue.getByRole("button", { name: "Rio 대화 닫기" }).click();
  await expect(dialogue).toBeHidden();

  await rio.click();
  await expect(dialogue).toBeVisible();
  const stage = page.locator(".office-stage");
  const box = await stage.boundingBox();
  if (!box) throw new Error("Office stage is not visible.");
  await stage.click({ position: { x: box.width - 10, y: box.height - 10 } });
  await expect(dialogue).toBeHidden();
});

test("toggles a monitor and dismisses it from the room background", async ({
  page,
}) => {
  await mockConsole(page);
  await page.goto("/");
  await switchToOfficeMode(page);

  const heading = page.getByRole("heading", { name: "SYSTEM STATUS" });

  await selectFromControlPanel(page, /SYSTEM STATUS: ONLINE/);
  await expect(heading).toBeVisible();
  await selectFromControlPanel(page, /SYSTEM STATUS: ONLINE/);
  await expect(heading).toBeHidden();

  await selectFromControlPanel(page, /SYSTEM STATUS: ONLINE/);
  await expect(heading).toBeVisible();
  const stage = page.locator(".office-stage");
  const box = await stage.boundingBox();
  if (!box) throw new Error("Office stage is not visible.");
  await stage.click({ position: { x: box.width - 10, y: box.height - 10 } });
  await expect(heading).toBeHidden();
});

test("uses the alert scene when the bot is offline", async ({ page }) => {
  await mockConsole(page, { ...healthy, online: false, pid: null });
  await page.goto("/");
  await switchToOfficeMode(page);

  await expect(page.locator(".command-deck")).toHaveAttribute(
    "data-scene",
    "alert",
  );
  await page.getByRole("button", { name: "CONTROL PANEL" }).click();
  await expect(
    page.getByRole("button", { name: /SYSTEM STATUS: OFFLINE/ }),
  ).toBeVisible();
});

test("guides an offline bot investigation from the action card", async ({
  page,
}) => {
  await mockConsole(page, { ...healthy, online: false, pid: null });
  await page.goto("/");
  await switchToOfficeMode(page);

  const card = page.getByText("BOT SERVICE OFFLINE").locator("..");
  await expect(card).toBeVisible();
  await expect(
    page.getByText("Discord 메시지에 응답할 수 없습니다."),
  ).toBeVisible();
  await page.getByRole("button", { name: "상세 조사" }).click();
  await expect(
    page.getByRole("heading", { name: "SYSTEM STATUS" }),
  ).toBeVisible();
});

test("requires confirmation before stopping the bot", async ({ page }) => {
  await mockConsole(page);
  await page.goto("/");
  await switchToOfficeMode(page);

  await selectFromControlPanel(page, /RIO CONTROL: AUTHORIZED/);
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

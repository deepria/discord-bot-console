import { expect, test, type Page } from "@playwright/test";
import { presenceFixture } from "../fixtures/presence";
import { memoryEvaluationFixture } from "../fixtures/memoryEvaluation";
import { memoryDetailFixture } from "../fixtures/memoryDetail";
import type { BotStatus, ConsoleActor } from "../../src/types/api";

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
  actor: ConsoleActor | null = null,
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
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: { oauth_enabled: true, actor } }),
  );
  await page.route("**/api/logs?**", (route) =>
    route.fulfill({ json: { logs: ["boot complete"] } }),
  );
  await page.route("**/api/deployments", (route) =>
    route.fulfill({
      json: {
        console: {
          schema_version: 1,
          deployment_id: "dep-console-test",
          component: "console",
          target_revision: "test",
          running_revision: "test",
          status: "succeeded",
          phase: "readiness",
          started_at: "2026-09-23T00:00:00Z",
          finished_at: "2026-09-23T00:00:02Z",
          verified_at: "2026-09-23T00:00:02Z",
          checks: [],
          previous_revision: null,
          log_ref: null,
          error: null,
        },
        deployments: [],
      },
    }),
  );
  await page.route("**/api/settings/runtime", (route) =>
    route.fulfill({
      json: {
        settings: [
          {
            key: "chat_web_search",
            env_name: "CHAT_WEB_SEARCH",
            value: true,
            display_value: "on",
            source: "db",
            kind: "bool",
            minimum: null,
            maximum: null,
            empty_allowed: false,
          },
        ],
      },
    }),
  );
  await page.route("**/api/settings/audit-events?**", (route) =>
    route.fulfill({
      json: {
        events: [
          {
            id: "audit-1",
            occurred_at: "2026-09-22T06:20:00Z",
            actor_kind: "discord",
            actor_id: "1234",
            action: "runtime_config.set",
            target: "CHAT_WEB_SEARCH",
            outcome: "success",
            request_id: "interaction-1",
          },
        ],
      },
    }),
  );
  await page.route("**/api/bot/**", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.route("**/api/bot/presence**", (route) =>
    route.fulfill({ json: presenceFixture() }),
  );
}

test("shows the authenticated Discord role instead of another login link", async ({
  page,
}) => {
  await mockConsole(page, healthy, { id: "123456789", role: "admin" });
  await page.goto("/");

  await expect(page.getByText("관리자")).toBeVisible();
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Discord 로그인" })).toBeHidden();
});

test("shows an agent-backed read-only runtime settings snapshot", async ({
  page,
}) => {
  await mockConsole(page);
  await page.goto("/");

  await page.getByRole("link", { name: "설정", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "RUNTIME SETTINGS" }),
  ).toBeVisible();
  await expect(
    page.getByText("CHAT_WEB_SEARCH", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("DB OVERRIDE", { exact: true })).toBeVisible();
});

test("requires confirmation before stopping the bot", async ({ page }) => {
  await mockConsole(page, healthy, {
    id: "test-admin",
    role: "admin",
  });
  await page.goto("/");

  await page.getByRole("link", { name: "설정", exact: true }).click();
  await page.getByRole("link", { name: "봇 조작", exact: true }).click();
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

test("opens investigation panels through the keyboard command palette", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "Mobile browsers do not expose a Cmd/Ctrl keyboard shortcut.",
  );
  await mockConsole(page);
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: "명령 팔레트 열기" }),
  ).toBeVisible();
  await page.keyboard.press("ControlOrMeta+K");
  const palette = page.getByRole("dialog", { name: "명령 팔레트" });
  await expect(palette).toBeVisible();
  await palette.getByRole("searchbox", { name: "명령 검색" }).fill("logs");
  await palette.getByRole("button", { name: "Log Stream 열기" }).click();
  await expect(palette).toBeHidden();
  await expect(page.getByRole("heading", { name: "LOG STREAM" })).toBeVisible();
});

test("admin changes Discord Presence and sees the committed value after reload", async ({
  page,
}) => {
  await mockConsole(page, healthy, { id: "123", role: "admin" });
  let snapshot = presenceFixture();
  let writes = 0;
  await page.route("**/api/bot/presence**", async (route) => {
    if (route.request().method() === "PUT") {
      writes++;
      const payload = route.request().postDataJSON();
      snapshot = {
        ...snapshot,
        configured: {
          mode: payload.mode,
          status: payload.status,
          activity_type: payload.activity_type,
          activity_text: payload.activity_text,
        },
        operation: {
          request_id: payload.request_id,
          state: "queued",
          error: null,
          completed_at: null,
        },
      };
      await route.fulfill({ status: 202, json: snapshot });
    } else {
      if (snapshot.operation?.state === "queued")
        snapshot = {
          ...snapshot,
          last_sent: { ...snapshot.configured },
          manual: { ...snapshot.configured },
          operation: { ...snapshot.operation, state: "success" },
        };
      await route.fulfill({ json: snapshot });
    }
  });
  await page.goto("/");
  await page.getByRole("link", { name: "설정", exact: true }).click();
  await expect(page.locator("#presence-status")).toHaveValue("dnd");
  await page.locator("#presence-status").selectOption("online");
  await page.locator("#presence-activity").selectOption("watching");
  await page.locator("#presence-text").fill("서버 상태 확인 중");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Apply", exact: true })
    .click();
  await expect(page.locator(".presence-current")).toContainText(
    "Watching 서버 상태 확인 중",
  );
  expect(writes).toBe(1);
  await page.reload();
  await page.getByRole("link", { name: "설정", exact: true }).click();
  await expect(page.locator("#presence-status")).toHaveValue("online");
  await expect(page.locator("#presence-text")).toHaveValue("서버 상태 확인 중");
});

test("presence form rejects whitespace and prevents viewer changes", async ({
  page,
}) => {
  await mockConsole(page, healthy, { id: "123", role: "admin" });
  await page.goto("/");
  await page.getByRole("link", { name: "설정", exact: true }).click();
  await page.locator("#presence-text").fill("   ");
  await expect(
    page.getByRole("button", { name: "Apply", exact: true }),
  ).toBeDisabled();
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: { oauth_enabled: true, actor: { id: "456", role: "viewer" } },
    }),
  );
  await page.reload();
  await page.getByRole("link", { name: "설정", exact: true }).click();
  await expect(page.locator("#presence-mode")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Apply", exact: true }),
  ).toBeDisabled();
});

test("public Memory panel shows screening progress after reload and retains stale evidence on failure", async ({
  page,
}) => {
  await mockConsole(page);
  await page.route("**/api/memory?**", (route) =>
    route.fulfill({
      json: { source_status: "HEALTHY", memory: [], next_cursor: null },
    }),
  );
  let fail = false;
  let writes = 0;
  await page.route("**/api/memory/evaluation", (route) => {
    if (route.request().method() !== "GET") writes++;
    return fail
      ? route.fulfill({
          status: 503,
          json: { detail: "Memory 평가 연결 실패" },
        })
      : route.fulfill({ json: memoryEvaluationFixture() });
  });
  await page.goto("/investigate?view=memory");
  const panel = page.getByRole("region", { name: "기억 평가 준비 상태" });
  await expect(panel).toContainText("38 / 50건");
  await expect(panel).toContainText("평가 자료 수집 중");
  await page.reload();
  await expect(panel).toContainText("38 / 50건");
  fail = true;
  await panel.getByRole("button", { name: "새로고침" }).click();
  await expect(panel).toContainText("STALE · 마지막 조회 결과");
  await expect(panel).toContainText("38 / 50건");
  await expect(panel).toContainText("Memory 평가 연결 실패");
  expect(writes).toBe(0);
});

test("admin inspects a selected memory candidate and logout clears its content", async ({
  page,
}) => {
  await mockConsole(page, healthy, { id: "42", role: "admin" });
  const detail = memoryDetailFixture();
  let reads = 0;
  let loggedIn = true;
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        oauth_enabled: true,
        actor: loggedIn ? { id: "42", role: "admin" } : null,
      },
    }),
  );
  await page.route("**/api/auth/logout", (route) => {
    loggedIn = false;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/memory?**", (route) =>
    route.fulfill({
      json: {
        source_status: "HEALTHY",
        next_cursor: null,
        memory: [
          {
            id: 1,
            owner_id: "99",
            kind: "preference",
            disclosure: "owner_private",
            confidence: 0.9,
            created_at: "2026-10-01T12:00:00Z",
          },
        ],
      },
    }),
  );
  await page.route("**/api/memory/evaluation", (route) =>
    route.fulfill({ json: memoryEvaluationFixture() }),
  );
  await page.route("**/api/memory/1?**", (route) => {
    reads++;
    return route.fulfill({ json: detail });
  });
  await page.goto("/investigate?view=memory");
  const open = page.getByRole("button", { name: "기억 후보 1 내용 보기" });
  await expect(open).toBeEnabled();
  expect(reads).toBe(0);
  await expect(
    page.getByText(detail.memory.content, { exact: true }),
  ).toHaveCount(0);
  await open.click();
  await expect(
    page.getByText(detail.memory.content, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("연결 누락", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Discord 원본 메시지 1 보기" }),
  ).toHaveAttribute("href", "https://discord.com/channels/10/20/100");
  await page.getByRole("button", { name: "내용 닫기", exact: true }).click();
  await expect(
    page.getByText(detail.memory.content, { exact: true }),
  ).toHaveCount(0);
  await open.click();
  await expect(
    page.getByText(detail.memory.content, { exact: true }),
  ).toBeVisible();
  const logout = page.getByRole("button", { name: "로그아웃", exact: true });
  await logout.focus();
  await logout.press("Enter");
  await expect(open).toBeDisabled();
  await expect(
    page.getByText(detail.memory.content, { exact: true }),
  ).toHaveCount(0);
  expect(reads).toBe(2);
});

test("memory owner selection separates users and clears the previous body", async ({
  page,
}, info) => {
  await mockConsole(page, healthy, { id: "910000000000000099", role: "admin" });
  const rows = [
    {
      id: 1,
      owner_id: "910000000000000099",
      kind: "preference",
      disclosure: "owner_private",
      confidence: 0.9,
      created_at: "2026-10-01T12:00:00Z",
    },
    {
      id: 2,
      owner_id: "910000000000000088",
      kind: "fact",
      disclosure: "owner_private",
      confidence: 0.8,
      created_at: "2026-10-01T11:00:00Z",
    },
  ];
  await page.route("**/api/memory?**", (route) => {
    const owner = new URL(route.request().url()).searchParams.get("owner_id");
    return route.fulfill({
      json: {
        source_status: "HEALTHY",
        next_cursor: null,
        memory: owner ? rows.filter((row) => row.owner_id === owner) : rows,
      },
    });
  });
  await page.route("**/api/memory/evaluation", (route) =>
    route.fulfill({ json: memoryEvaluationFixture() }),
  );
  const detail = memoryDetailFixture();
  detail.memory.owner_id = "910000000000000099";
  await page.route("**/api/memory/1?**", (route) =>
    route.fulfill({ json: detail }),
  );
  await page.goto("/investigate?view=memory");
  const selector = page.getByRole("combobox", { name: "기억 소유자" });
  await expect(selector).toBeVisible();
  await expect(
    page.locator("dd").filter({ hasText: "내 기억 · ID 910000000000000099" }),
  ).toBeVisible();
  await expect(
    page
      .locator("dd")
      .filter({ hasText: "사용자 기억 · ID 910000000000000088" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "기억 후보 1 내용 보기" }).click();
  await expect(
    page.getByText("간결한 답변을 선호한다.", { exact: true }),
  ).toBeVisible();
  await selector.selectOption("910000000000000088");
  await expect(
    page.getByText("간결한 답변을 선호한다.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "기억 후보 1 내용 보기" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "기억 후보 2 내용 보기" }),
  ).toBeVisible();
  await page.locator("#monitor-panel .panel-content").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("memory-owner.png"),
    fullPage: true,
  });
});

test("shows five distinct recent failures and opens Live Events", async ({
  page,
}, testInfo) => {
  const failures = Array.from({ length: 6 }, (_, i) => ({
    at: `2026-10-20T01:00:0${i}Z`,
    event: "turn.failed",
    turn_id: `turn-${i}`,
    error_type: `Failure${i}`,
    provider_error_message: "PRIVATE_PROVIDER_BODY",
  }));
  await mockConsole(page, {
    ...healthy,
    events: [
      ...failures,
      { ...failures[5], event: "turn_failed" },
      {
        at: "2026-10-20T01:00:07Z",
        event: "structured_memory_shadow",
        rejected: { policy: 1 },
      },
    ],
  });
  await page.goto("/");
  await page.getByRole("link", { name: "상태 및 복구" }).click();
  const errors = page.getByRole("region", { name: "최근 응답 오류" });
  await errors.scrollIntoViewIfNeeded();
  await expect(errors.locator("li")).toHaveCount(5);
  await expect(errors.locator("li").first()).toContainText("Failure5");
  await expect(errors.locator("li").last()).toContainText("Failure1");
  await expect(errors).not.toContainText("PRIVATE_PROVIDER_BODY");
  await expect(
    page.getByText("ALL SYSTEMS NOMINAL", { exact: true }),
  ).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath("recent-errors.png"),
    animations: "disabled",
    fullPage: true,
  });
  await errors.getByRole("link", { name: "Live Events 보기" }).click();
  await expect(
    page.getByRole("heading", { name: "LIVE EVENTS" }),
  ).toBeVisible();
});

test("public recovery retries status reads and keeps service controls disabled", async ({
  page,
}) => {
  await mockConsole(page);
  let reads = 0;
  let writes = 0;
  await page.route("**/api/status", (route) => {
    reads++;
    return reads === 2
      ? route.fulfill({
          status: 503,
          json: { detail: "Agent status unavailable" },
        })
      : route.fulfill({ json: healthy });
  });
  page.on("request", (request) => {
    if (request.method() === "POST") writes++;
  });
  await page.goto("/");
  await page.getByRole("link", { name: "상태 및 복구" }).click();
  const recovery = page.getByRole("region", { name: "상태 조회 및 복구" });
  await expect(
    recovery.getByRole("button", { name: /RESTART/ }),
  ).toBeDisabled();
  await recovery
    .getByRole("button", { name: "상태 다시 조회", exact: true })
    .click();
  await expect(
    recovery.getByRole("status", { name: "상태 재조회 결과" }),
  ).toContainText("일부 상태를 조회하지 못했습니다");
  await expect(
    page.getByText("Agent status unavailable", { exact: true }).first(),
  ).toBeVisible();
  await recovery
    .getByRole("button", { name: "상태 다시 조회", exact: true })
    .click();
  await expect(
    recovery.getByRole("status", { name: "상태 재조회 결과" }),
  ).toContainText("최신 상태를 다시 조회했습니다");
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "상세 패널 닫기" }).click();
  await page.getByRole("link", { name: "봇 조작" }).click();
  for (const label of [/^START/, /^RESTART/, /^STOP/]) {
    await expect(
      page
        .getByRole("complementary", { name: "RIO CONTROL", exact: true })
        .getByRole("button", { name: label }),
    ).toBeDisabled();
  }
});

test("admin confirms recovery restart and pending state survives panel changes", async ({
  page,
}, testInfo) => {
  await mockConsole(page, healthy, { id: "42", role: "admin" });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  await page.route("**/api/bot/restart", async (route) => {
    writes++;
    await gate;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "상태 및 복구" }).click();
  const recovery = page.getByRole("region", { name: "상태 조회 및 복구" });
  await recovery.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("recovery-overview.png"),
    animations: "disabled",
    fullPage: true,
  });
  await recovery.getByRole("button", { name: /RESTART/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Rio Bot을 재시작할까요?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  expect(writes).toBe(0);
  await recovery.getByRole("button", { name: /RESTART/ }).click();
  await page.getByRole("button", { name: "재시작 실행", exact: true }).click();
  await expect(
    recovery.getByRole("button", { name: /RESTART/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "상세 패널 닫기" }).click();
  await page.getByRole("link", { name: "봇 조작" }).click();
  const controlPanel = page.getByRole("complementary", {
    name: "RIO CONTROL",
    exact: true,
  });
  await expect(
    controlPanel.getByRole("button", { name: /RESTART/ }),
  ).toBeDisabled();
  release();
  await expect(
    controlPanel.getByText(/SUCCESS \/ 재시작 요청을 완료했어/),
  ).toBeVisible();
  await expect(
    controlPanel.getByText("post-check 통과", { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
  await page.screenshot({
    path: testInfo.outputPath("recovery-control.png"),
    animations: "disabled",
    fullPage: true,
  });
});

test("settings confirmations have unique accessible labels", async ({
  page,
}, testInfo) => {
  await mockConsole(page, healthy, { id: "42", role: "admin" });
  await page.goto("/");
  await page.getByRole("link", { name: "설정", exact: true }).click();
  const labels = await page.locator("dialog").evaluateAll((dialogs) =>
    dialogs.map((dialog) => {
      const id = dialog.getAttribute("aria-labelledby");
      return {
        id,
        count: [...document.querySelectorAll("[id]")].filter(
          (node) => node.id === id,
        ).length,
      };
    }),
  );
  expect(labels.length).toBeGreaterThanOrEqual(3);
  expect(labels.every((label) => label.id && label.count === 1)).toBe(true);
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "PUT") writes++;
  });
  const apply = page.getByRole("button", { name: "Apply", exact: true });
  await apply.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Discord Presence 변경",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(
    /적용하고 재시작 후에도 유지/,
  );
  const cancel = dialog.getByRole("button", { name: "취소", exact: true });
  await expect(cancel).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath("keyboard-confirmation.png"),
    animations: "disabled",
    fullPage: true,
  });
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Apply", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Apply", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("ControlOrMeta+K");
  await expect(page.getByRole("dialog", { name: "명령 팔레트" })).toHaveCount(
    0,
  );
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(apply).toBeFocused();
  expect(writes).toBe(0);
});

test("palette keyboard isolation and selection preserve the destination focus", async ({
  page,
}) => {
  await mockConsole(page);
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "명령 팔레트 열기" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const palette = page.getByRole("dialog", { name: "명령 팔레트" });
  const search = palette.getByRole("searchbox", { name: "명령 검색" });
  await expect(search).toBeFocused();
  await expect(page.locator(".operations")).toHaveAttribute("inert", "");
  await palette.getByRole("button").last().focus();
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  await search.fill("not-a-command");
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator(".operations")).not.toHaveAttribute("inert", "");
  await page.keyboard.press("Enter");
  await search.fill("기억");
  await expect(
    palette.getByRole("button", { name: "Memory Index 열기" }),
  ).toBeVisible();
  await search.fill("logs");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  const panel = page.getByRole("complementary", {
    name: "LOG STREAM",
    exact: true,
  });
  await expect(panel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("link", { name: "개요", exact: true }),
  ).toBeFocused();
});

test("keyboard focus indicators and reduced motion remain visible", async ({
  page,
}) => {
  await mockConsole(page, healthy, { id: "42", role: "admin" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const trigger = page.getByRole("link", {
    name: "상태 및 복구",
  });
  await page.keyboard.press("Tab");
  await trigger.focus();
  await expect(trigger).toBeFocused();
  const indicator = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement!);
    return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
  });
  expect(indicator.width).toBeGreaterThanOrEqual(2);
  expect(indicator.style).not.toBe("none");
  const duration = await page
    .locator(".operations")
    .evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration));
  expect(duration).toBeLessThan(0.01);
  await page.getByRole("link", { name: "설정", exact: true }).click();
  const field = page.locator("#presence-mode");
  await field.focus();
  await expect(field).toBeFocused();
  const formIndicator = await page.evaluate(
    () => getComputedStyle(document.activeElement!).outlineStyle,
  );
  expect(formIndicator).not.toBe("none");
});

test("confirmation returns focus to the panel while its source is disabled", async ({
  page,
}) => {
  await mockConsole(page, healthy, { id: "42", role: "admin" });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/bot/presence**", async (route) => {
    if (route.request().method() === "PUT") {
      await gate;
      await route.fulfill({
        status: 400,
        json: { detail: "Synthetic validation rejection" },
      });
    } else await route.fulfill({ json: presenceFixture() });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "설정", exact: true }).click();
  const settings = page.getByRole("complementary", {
    name: "RUNTIME SETTINGS",
    exact: true,
  });
  await settings.getByRole("button", { name: "Apply", exact: true }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Discord Presence 변경",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Apply", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(settings).toBeFocused();
  await expect(
    settings.getByRole("button", { name: "적용 확인 중…", exact: true }),
  ).toBeDisabled();
  release();
  await expect(
    settings
      .getByRole("region", { name: "DISCORD PRESENCE", exact: true })
      .getByRole("status"),
  ).toContainText("Synthetic validation rejection");
});

test("retained Usage shows coverage limits and requests 90 days", async ({
  page,
}, testInfo) => {
  await mockConsole(page);
  const requested: string[] = [];
  await page.route("**/api/analytics/usage?**", (route) => {
    requested.push(route.request().url());
    return route.fulfill({
      json: {
        source_status: "HEALTHY",
        source: { status: "HEALTHY", last_success_at: null, error_code: null },
        group_by: "provider",
        groups: [],
        coverage: {
          mode: "retained",
          retention_days: 90,
          collection_started_at: "2026-10-22T00:00:00Z",
          oldest_at: null,
          newest_at: null,
          truncated: true,
          history_limited: true,
          cleanup_pending: false,
        },
      },
    });
  });
  await page.goto("/investigate?view=usage");
  const panel = page.getByRole("complementary", {
    name: "USAGE ANALYTICS",
    exact: true,
  });
  await panel.getByLabel("PERIOD").selectOption("2160");
  await expect
    .poll(() => requested.some((url) => url.includes("window_hours=2160")))
    .toBe(true);
  await expect(panel).toContainText("일부 자료만 표시");
  await expect(panel).toContainText("보존 시작 전");
  await expect(panel).toContainText("현재 보존 기록이 없습니다");
  await panel.screenshot({
    path: testInfo.outputPath("telemetry-coverage.png"),
  });
});

test("Trace legacy tail is never displayed as a complete retained period", async ({
  page,
}) => {
  await mockConsole(page);
  await page.route("**/api/traces?**", (route) =>
    route.fulfill({
      json: {
        source_status: "HEALTHY",
        source: { status: "HEALTHY", last_success_at: null, error_code: null },
        traces: [],
        next_cursor: null,
        coverage: {
          mode: "legacy_tail",
          retention_days: 30,
          collection_started_at: null,
          oldest_at: null,
          newest_at: null,
          truncated: true,
          history_limited: true,
          cleanup_pending: false,
        },
      },
    }),
  );
  await page.goto("/investigate");
  const panel = page.getByRole("complementary", {
    name: "TURN TRACES",
    exact: true,
  });
  await expect(panel).toContainText("최근 로그 일부만");
  await expect(panel.getByLabel("PERIOD")).toHaveValue("720");
});

import { expect, test } from "@playwright/test";

test("overview keeps essential status visible and makes only summary requests", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "chromium") {
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  const requests = new Set<string>();
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) requests.add(path);
  });
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        online: true,
        pid: 5,
        runtime: { model: "test", latency_ms: 40 },
        events: [
          {
            at: "2026-11-25T01:00:00Z",
            event: "turn.failed",
            turn_id: "failed-turn",
            error_type: "TimeoutError",
          },
        ],
      },
    }),
  );
  await page.route("**/api/analytics/usage?**", (route) =>
    route.fulfill({
      json: {
        source_status: "HEALTHY",
        source: { status: "HEALTHY", last_success_at: null, error_code: null },
        group_by: "provider",
        groups: [],
      },
    }),
  );
  await page.route("**/api/deployments", (route) =>
    route.fulfill({ status: 503 }),
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: { oauth_enabled: false, actor: null } }),
  );

  await page.goto("/");
  const menu = page.getByRole("navigation", { name: "주 메뉴" });
  await expect(menu.getByRole("link")).toHaveText(["개요", "조사", "설정"]);
  await expect(page.getByText("지연 40 ms")).toBeVisible();
  await expect(page.getByText("배포 갱신 실패")).toBeVisible();
  await expect(page.getByText("요청 0건 · 오류 0건")).toBeVisible();

  if (testInfo.project.name === "chromium") {
    for (const name of ["봇 상태", "최근 실패", "배포 상태"]) {
      await expect(page.getByRole("region", { name })).toBeInViewport();
    }
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  expect([...requests].sort()).toEqual([
    "/api/analytics/usage",
    "/api/auth/me",
    "/api/deployments",
    "/api/status",
  ]);
});

test("opens a failed turn, restores the Trace list, and remembers safe URL filters", async ({
  page,
}) => {
  const failure = {
    at: "2026-11-25T01:00:00Z",
    event: "turn.failed",
    turn_id: "lookup-turn",
    error_type: "TimeoutError",
  };
  const status = { online: true, events: [failure] };
  const source = {
    status: "HEALTHY",
    last_success_at: failure.at,
    error_code: null,
  };
  const queries: URL[] = [];
  await page.route("**/api/status", (route) => route.fulfill({ json: status }));
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: { oauth_enabled: true, actor: null } }),
  );
  await page.route("**/api/deployments", (route) =>
    route.fulfill({ json: { deployments: [] } }),
  );
  await page.route("**/api/analytics/usage?**", (route) =>
    route.fulfill({
      json: {
        source_status: "HEALTHY",
        source,
        group_by: "provider",
        groups: [],
      },
    }),
  );
  await page.route("**/api/traces?**", (route) => {
    queries.push(new URL(route.request().url()));
    return route.fulfill({
      json: {
        traces: [failure],
        next_cursor: null,
        source_status: "HEALTHY",
        source,
      },
    });
  });
  await page.route("**/api/traces/lookup-turn", (route) =>
    route.fulfill({ json: { traces: [failure] } }),
  );

  await page.goto("/");
  await page.getByRole("link", { name: /Trace 열기/ }).click();
  await expect(page.getByRole("heading", { name: "Trace 상세" })).toBeVisible();
  await expect(page).toHaveURL(/turn=lookup-turn/);
  await page.getByRole("button", { name: "Trace 닫기" }).click();
  await expect(page.getByRole("heading", { name: "Trace 상세" })).toBeHidden();
  const period = page.getByLabel("PERIOD");
  await period.selectOption("168");
  await expect(page).toHaveURL(/hours=168/);
  await page.getByRole("button", { name: "TURN.FAILED" }).click();
  await page.getByRole("button", { name: "Trace 닫기" }).click();
  await expect(page.getByRole("button", { name: "TURN.FAILED" })).toBeFocused();
  await page.reload();
  await expect(period).toHaveValue("168");
  expect(
    queries.some((query) => {
      const to = Date.parse(query.searchParams.get("to") ?? "");
      const from = Date.parse(query.searchParams.get("from") ?? "");
      return (to - from) / 3600000 === 168;
    }),
  ).toBe(true);
});

test("settings search keeps runtime values visible and hides editing for a viewer", async ({
  page,
}) => {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        oauth_enabled: true,
        actor: { id: "123", username: "viewer", role: "viewer" },
      },
    }),
  );
  await page.route("**/api/settings/runtime", (route) =>
    route.fulfill({
      json: {
        settings: [
          {
            key: "always_reply_channel_ids",
            env_name: "ALWAYS_REPLY_CHANNEL_IDS",
            source: "db",
            kind: "channel_ids",
            value: ["1234567890"],
            display_value: "1234567890",
            empty_allowed: true,
          },
          {
            key: "chat_web_search",
            env_name: "CHAT_WEB_SEARCH",
            source: "startup",
            kind: "bool",
            value: true,
            display_value: "on",
            empty_allowed: false,
          },
        ],
      },
    }),
  );
  await page.goto("/settings");
  await expect(page.getByText("1234567890")).toBeVisible();
  await expect(
    page.getByText("CHAT_WEB_SEARCH", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "설정 이름 검색" })
    .fill("always_reply");
  await expect(page.getByText("CHAT_WEB_SEARCH", { exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "EDIT" })).toHaveCount(0);
});

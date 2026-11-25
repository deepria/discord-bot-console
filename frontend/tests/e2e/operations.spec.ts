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

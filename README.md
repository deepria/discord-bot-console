# Rio Command Deck

Rio Command Deck is the operations console for the Rio Discord Bot. The FastAPI service proxies the control agent while a Vue 3 application renders the interactive office scene.

## Architecture

```text
Browser
  -> Vue 3 + TypeScript + Pinia + Vue Router
  -> /api/* and /api/logs/stream
  -> FastAPI
  -> Rio Control Agent
```

The production container builds the frontend in a Node stage and copies only `frontend/dist` into the Python runtime image.

## Interaction

- Select one of the five room monitors to open its operations panel. Select the
  same monitor again, press Escape, use the close button, or select the room
  background to close it.
- **Operations Status** unifies System Status, Discord / AI, and Data Link in
  one overview. It shows the current aggregate state, each area's key metrics,
  the data-flow path, and the last verified response. Use Live Events, Log
  Stream, and Rio Control for their respective detailed workflows.
  Recent Errors shows up to five response failures from the latest received
  event window, newest first. Legacy `turn_failed` and `turn.failed` events
  with the same turn ID count once. It displays safe error metadata, not
  conversation bodies or provider error messages. Unavailable/stale events
  are distinguished from a successfully checked window with no failures;
  historical failures do not change the current connection-health summary.
- **Status / Recovery** in Operations Status retries the existing status read
  for all visitors and exposes the existing service restart to Discord admins
  after confirmation. Rio Control uses the same controls and permission state.
  The shared pending state stays locked through post-checks, including when
  switching panels. Post-checks require a fresh successful status read after
  the command; cached ONLINE is not accepted after a read failure. This checks
  service state, not Discord gateway readiness. Status retry does not execute
  a synchronization job or reconnect Discord. The current architecture has no
  separate synchronization/reconnect command, so those actions are not offered.
- Select Rio to open the game-style dialogue window. Repeatedly select Rio or
  the dialogue body to advance through the portrait expressions and messages.
- The official in-game portrait sources and redistribution note are documented
  in `frontend/src/assets/rio/SOURCES.md`.

## Keyboard accessibility

Panels and Settings receive focus when opened and return it to the launching
control when closed; if submission disables that control, focus returns to its
panel. The command palette keeps focus inside, makes the background
inert, includes Memory Index, and passes focus to the selected panel. Confirmation
dialogs use unique title/description IDs, focus Cancel first, and cycle Tab in both
directions. Cmd/Ctrl+K does not open another overlay over an active confirmation.
Service command results use a named live status region; inputs, links, selectors,
and navigation keep visible focus indicators.

Chromium and mobile WebKit tests cover these flows and reduced motion. The text
color tokens are checked at 4.5:1 against fixed surfaces in normal/alert themes,
using the [WCAG contrast formula](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum).
This is a bounded browser check, not a complete WCAG certification or a substitute
for testing actual screen-reader speech and every Office scene image/background.

## Local development

Use Node.js 22.22+ (or 24.15+) and npm 11+ for the frontend toolchain.

Run FastAPI with the required agent environment variables:

```bash
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
RIO_AGENT_TOKEN=... .venv/bin/uvicorn app:app --reload --port 8000
```

Python dependencies are pinned in `requirements.txt` (runtime) and
`requirements-dev.txt` (tests). Deployment records and Presence validation require
Pydantic 2. CI and Docker install the same runtime requirements; update pins together
and run `python -m pip check` and the backend tests when changing them.

### 제어 작업용 Discord 로그인

읽기 전용 화면은 로그인 없이 사용할 수 있습니다. Bot 제어와 Runtime Settings·정책·Presence 변경은
Discord OAuth 로그인과 Bot의 기존 `BOT_ADMIN_IDS`에 포함된 Discord 사용자 ID를 요구합니다.
Console은 별도의 관리자 목록을 관리하지 않습니다.

Console 서비스 환경변수에 아래 값을 설정하고, Discord Developer Portal의
**OAuth2 Redirects**에 callback URL을 정확히 등록하세요.

```bash
RIO_CONSOLE_DISCORD_CLIENT_ID=...
RIO_CONSOLE_DISCORD_CLIENT_SECRET=...
RIO_CONSOLE_DISCORD_REDIRECT_URI=https://console.example/auth/discord/callback
RIO_CONSOLE_SESSION_SECRET=<at-least-32-random-characters>
RIO_CONSOLE_SESSION_COOKIE_SECURE=true
RIO_CONSOLE_IDENTITY_SECRET=<same-secret-configured-on-rio-agent>
```

`RIO_CONSOLE_SESSION_COOKIE_SECURE=false`는 로컬 HTTP 개발 환경에서만 사용하세요.
브라우저에는 HttpOnly·서명·8시간 만료 세션 cookie만 전달됩니다. Discord OAuth access token,
client secret, `RIO_AGENT_TOKEN`, `RIO_CONSOLE_IDENTITY_SECRET`은 브라우저에 노출되지 않습니다.
`RIO_CONSOLE_IDENTITY_SECRET`은 이후 memory metadata detail 요청에서 Console의 OAuth 관리자 identity를
Agent에 짧은 수명의 HMAC signature로 전달할 때만 사용합니다.

Run Vite in a second terminal. It proxies `/api` to port 8000.

```bash
cd frontend
npm ci
npm run dev
```

## Validation

```bash
cd frontend
npm run lint
npm run format:check
npm run typecheck
npm run test:run
npm run build
npm run e2e

cd ..
RIO_AGENT_TOKEN=test-token python -m pytest -q
```

The end-to-end suite uses deterministic API and EventSource fixtures. Real Start, Restart, and Stop actions should be verified only against staging or during an approved maintenance window.

## Console deployment status record

`/api/deployments` reads `/run/rio-console/deploy-status.json` through the
read-only `data` bind mount. The CT 102 deploy service must publish a
**deployment-status v1** record after every deploy phase; without one, the
Console intentionally reports deployment verification as `UNKNOWN`, never as
healthy.

Use `scripts/write_deploy_status.py` from the privileged host deploy service,
not from the container. It writes the JSON atomically. A successful deploy must
include matching target/running revisions, a `verified_at` timestamp, and the
readiness checks that prove the recreated container can serve the Console and
reach the Control Agent.

```bash
python scripts/write_deploy_status.py \
  --file /opt/services/apps/rio-console/data/deploy-status.json \
  --deployment-id "dep_$(date -u +%Y%m%dT%H%M%SZ)_console_<short-sha>" \
  --status succeeded --phase readiness \
  --target-revision <full-sha> --running-revision <full-sha> \
  --verified-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --check container-http=passed --check agent-connectivity=passed
```

On build, recreate, revision, or readiness failure, publish `--status failed`
with the failed phase and a short content-free error. Do not write credentials,
environment values, user messages, or raw journal output to this record.

`deploy/rio-console-deploy.sh` and its adjacent `.service`/`.timer` files are
CT 102 installation templates. Review their paths and deploy cadence, then copy
the unit files to `/etc/systemd/system/`, run `systemctl daemon-reload`, and
enable the timer during an approved maintenance window. Do not install or invoke
them from the Console container.

The five-minute timer polls for updates. If the running container's revision matches
`main`, it is running, and its HTTP health check passes, deployment skips image
build and container recreation. Revision and HTTP/Agent readiness checks still
refresh the deployment evidence. Missing, stopped, unhealthy, or outdated containers
are rebuilt and recreated, including recovery when a previous attempt advanced Git
but failed to deploy. An Agent connectivity failure alone fails verification without
recreating an otherwise healthy Console. For intentional rebuilds after environment,
Compose, or base-image changes without a new commit, run the host deployment script
with `RIO_CONSOLE_FORCE_DEPLOY=1`; the scheduled timer does not set this override.

## Discord Presence

Runtime Settings includes a Discord Presence section. An authenticated Discord admin
can choose Manual/Auto, Online/Idle/Do Not Disturb/Invisible, Playing/Watching/Listening,
and a 1–128 Unicode code point activity text. Streaming and workload-specific Auto
rules are deferred. Auto applies Online / Playing 대기 중; Manual persists across Bot
restart. Presence status is independent of service availability.

`GET /api/bot/presence` proxies the Agent snapshot. `PUT /api/bot/presence` uses the
existing admin session and passes the server-derived actor ID and client request UUID
to the Agent. Accepted writes return 202; the Console polls the request until its
outcome is known. The page shows last sent state, connection/freshness, pending and
uncertain outcomes, and content-free change history. Failed polling retains the last
snapshot and disables writes. Bot and Agent Presence support must be deployed before
the Console; rebuilding the existing Docker image includes the frontend changes.

## Memory evaluation screening

The public Memory Index panel shows active/total lifecycle counts, active-item source
linkage, elapsed observation days, check time, and reasons more evidence is needed.
`GET /api/memory/evaluation` proxies the Agent's read-only Bot evaluation tool; deploy
Bot evaluation support and the Agent route before the Console. Thresholds come from
the tool (50 active items / 7 days by default) and cannot be changed from this page.
Failed refreshes retain prior counts with a stale warning; unavailable reports are
not displayed as zero samples. No memory content or source/owner IDs are added by
this endpoint. Metadata screening never enables retrieval or replaces quality,
privacy, representative-sample, and cost evaluation.

## Inspecting memory candidates

Memory Index prioritizes the candidate list; collection statistics can be expanded
separately. A Discord administrator can select **내용 보기** to inspect one candidate's
text, owner/scope, lifecycle/replacement, extraction timestamps, and message/turn
sources. Original conversations are not copied; guild-message links open Discord
under the operator's own Discord permissions. Missing turn IDs are shown explicitly.
Confidence is a model estimate, and all these candidates remain shadow-only.

Public list/evaluation reads remain metadata-only. Content uses the existing signed
administrator detail route with `include_content=true` and a content-free access
audit. `RIO_CONSOLE_IDENTITY_SECRET` must match on Console and Agent. Detail content
is held only in the mounted panel, cleared on close/logout, and never persisted in
Pinia or browser storage. Deploy Agent content support before the Console.


## Memory ownership inspection

Memory Index labels every candidate with its owner ID and marks the logged-in actor's entries
as their own. The owner selector filters metadata server-side; its options come from loaded pages
(and the signed-in actor). Next-page loading retains that filter. Names are not inferred from
candidate text and no new Discord profile information is made public. Numeric IDs remain the
fallback until a verified profile source is introduced.

Owner changes close and clear the previous body and ignore late metadata/detail responses.
Source health and global collection statistics are separate from content quality and are not
changed by the owner filter. Existing public metadata and admin-only, audited, no-store body
access policies remain in place. `owner_private` means private to that candidate's owner, not
necessarily the administrator currently inspecting it. Deploy Agent owner_id support first.

## Telemetry period coverage

Trace supports 24h/7d/30d filters and cursor paging. Usage supports up to 90 days.
Deploy the retained Bot writer, then Agent reader, then this Console. Both panels display
collection start, current record bounds, partial/legacy queries and pending expiry cleanup.
A readable store is not evidence of continuous history. Unknown token totals are counted
separately; exact p50/p95 are computed from the observed call samples by Agent.
The Bot expiry timer must be installed on CT 101 after preview review. Console neither opens
the Bot database nor performs expiry. Existing Agents without coverage stay compatible,
with an explicit unknown-coverage notice.

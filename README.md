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
- Select Rio to open the game-style dialogue window. Repeatedly select Rio or
  the dialogue body to advance through the portrait expressions and messages.
- The official in-game portrait sources and redistribution note are documented
  in `frontend/src/assets/rio/SOURCES.md`.

## Local development

Use Node.js 22.22+ (or 24.15+) and npm 11+ for the frontend toolchain.

Run FastAPI with the required agent environment variables:

```bash
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
RIO_AGENT_TOKEN=... .venv/bin/uvicorn app:app --reload --port 8000
```

### 제어 작업용 Discord 로그인

읽기 전용 화면은 로그인 없이 사용할 수 있습니다. Bot `START`, `RESTART`, `STOP`은
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

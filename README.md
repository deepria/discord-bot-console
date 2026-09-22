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

- Select one of the seven room monitors to open its operations panel. Select the
  same monitor again, press Escape, use the close button, or select the room
  background to close it.
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
```

`RIO_CONSOLE_SESSION_COOKIE_SECURE=false`는 로컬 HTTP 개발 환경에서만 사용하세요.
브라우저에는 HttpOnly·서명·8시간 만료 세션 cookie만 전달됩니다. Discord OAuth access token,
client secret, `RIO_AGENT_TOKEN`은 브라우저에 노출되지 않습니다.

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

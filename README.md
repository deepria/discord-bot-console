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

### Discord login for control actions

Read-only views work without a login. Bot `START`, `RESTART`, and `STOP` require
Discord OAuth and a Discord user ID present in the Bot's existing `BOT_ADMIN_IDS`.
The Console does not maintain a separate administrator list.

Configure these values in the Console service environment and register the exact
callback URL in the Discord Developer Portal under OAuth2 redirects:

```bash
RIO_CONSOLE_DISCORD_CLIENT_ID=...
RIO_CONSOLE_DISCORD_CLIENT_SECRET=...
RIO_CONSOLE_DISCORD_REDIRECT_URI=https://console.example/auth/discord/callback
RIO_CONSOLE_SESSION_SECRET=<at-least-32-random-characters>
RIO_CONSOLE_SESSION_COOKIE_SECURE=true
```

Set `RIO_CONSOLE_SESSION_COOKIE_SECURE=false` only for local HTTP development.
The browser receives an HttpOnly, signed eight-hour session cookie; Discord OAuth
access tokens, the client secret, and `RIO_AGENT_TOKEN` are never exposed to it.

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

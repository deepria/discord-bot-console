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

## Local development

Use Node.js 22.22+ (or 24.15+) and npm 11+ for the frontend toolchain.

Run FastAPI with the required agent environment variables:

```bash
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
RIO_AGENT_TOKEN=... .venv/bin/uvicorn app:app --reload --port 8000
```

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

import asyncio
import json
import httpx
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

app = FastAPI(title="Rio Control Center")
templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")

AGENT_URL = os.getenv("RIO_AGENT_URL", "http://172.30.1.101:8787")
AGENT_TOKEN = os.environ["RIO_AGENT_TOKEN"]
LOCAL_DEPLOY_STATUS_PATH = Path(
    os.getenv("RIO_CONSOLE_DEPLOY_STATUS_PATH", "/run/rio-console/deploy-status.json")
)

HEADERS = {
    "Authorization": f"Bearer {AGENT_TOKEN}"
}


@app.middleware("http")
async def prevent_runtime_api_caching(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response


async def agent_get(path: str):
    error = "agent request failed"
    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(f"{AGENT_URL}{path}", headers=HEADERS)
            if response.is_success:
                return response.json()
            error = f"agent returned HTTP {response.status_code}: {response.text[:300]}"
        except (httpx.HTTPError, ValueError) as exc:
            error = f"agent unavailable: {type(exc).__name__}"
        if attempt == 0:
            await asyncio.sleep(0.25)
    raise HTTPException(status_code=502, detail=error)


async def agent_post(path: str):
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{AGENT_URL}{path}",
            headers=HEADERS
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Agent error: {response.text}"
        )

    return response.json()


def local_deployment_status() -> dict:
    try:
        value = json.loads(LOCAL_DEPLOY_STATUS_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {
            "component": "console",
            "available": False,
            "detail": "Host deployment status has not been configured yet.",
        }
    except (OSError, json.JSONDecodeError):
        return {
            "component": "console",
            "available": False,
            "detail": "Host deployment status file is unreadable.",
        }
    return value if isinstance(value, dict) else {
        "component": "console", "available": False, "detail": "Invalid deployment status data."
    }


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={}
    )


@app.get("/api/status")
async def status():
    payload = await agent_get("/status")
    try:
        payload["events"] = (await agent_get("/events?lines=100")).get("events", [])
    except HTTPException as exc:
        payload["events"] = []
        payload["events_error"] = str(exc.detail)
    return payload


@app.get("/api/logs")
async def logs(lines: int = 50):
    lines = max(1, min(lines, 500))
    return await agent_get(f"/logs?lines={lines}")


@app.get("/api/events")
async def events(lines: int = 50):
    lines = max(1, min(lines, 500))
    return await agent_get(f"/events?lines={lines}")


@app.get("/api/runtime-events")
async def runtime_events(lines: int = 50):
    """Public console route kept distinct from the agent's /events endpoint."""
    return await events(lines)


@app.get("/api/deployments")
async def deployments():
    agent = await agent_get("/deployments")
    return {"console": local_deployment_status(), **agent}


@app.post("/api/bot/start")
async def bot_start():
    return await agent_post("/bot/start")


@app.post("/api/bot/stop")
async def bot_stop():
    return await agent_post("/bot/stop")


@app.post("/api/bot/restart")
async def bot_restart():
    return await agent_post("/bot/restart")

@app.get("/api/logs/stream")
async def console_logs_stream():
    from fastapi.responses import StreamingResponse

    async def proxy():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "GET",
                f"{AGENT_URL}/logs/stream",
                headers=HEADERS,
            ) as response:
                async for chunk in response.aiter_bytes():
                    yield chunk

    return StreamingResponse(
        proxy(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
import httpx
import os

app = FastAPI(title="Rio Control Center")
templates = Jinja2Templates(directory="templates")

AGENT_URL = os.getenv("RIO_AGENT_URL", "http://172.30.1.101:8787")
AGENT_TOKEN = os.environ["RIO_AGENT_TOKEN"]

HEADERS = {
    "Authorization": f"Bearer {AGENT_TOKEN}"
}


async def agent_get(path: str):
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            f"{AGENT_URL}{path}",
            headers=HEADERS
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Agent error: {response.text}"
        )

    return response.json()


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


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={}
    )


@app.get("/api/status")
async def status():
    return await agent_get("/status")


@app.get("/api/logs")
async def logs(lines: int = 50):
    lines = max(1, min(lines, 500))
    return await agent_get(f"/logs?lines={lines}")


@app.post("/api/bot/start")
async def bot_start():
    return await agent_post("/bot/start")


@app.post("/api/bot/stop")
async def bot_stop():
    return await agent_post("/bot/stop")


@app.post("/api/bot/restart")
async def bot_restart():
    return await agent_post("/bot/restart")

from fastapi.responses import StreamingResponse


@app.get("/api/logs/stream")
async def logs_stream():
    async def proxy():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "GET",
                f"{AGENT_URL}/logs/stream",
                headers=HEADERS
            ) as response:
                async for chunk in response.aiter_bytes():
                    yield chunk

    return StreamingResponse(
        proxy(),
        media_type="text/event-stream"
    )


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

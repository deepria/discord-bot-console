import asyncio
import base64
import hmac
import json
import os
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import Literal
from pathlib import Path
from urllib.parse import urlencode

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ValidationError

app = FastAPI(title="Rio Control Center")
APP_ROOT = Path(__file__).resolve().parent
FRONTEND_DIST = APP_ROOT / "frontend" / "dist"
app.mount(
    "/assets",
    StaticFiles(directory=FRONTEND_DIST / "assets", check_dir=False),
    name="frontend-assets",
)

AGENT_URL = os.getenv("RIO_AGENT_URL", "http://172.30.1.101:8787")
AGENT_TOKEN = os.environ["RIO_AGENT_TOKEN"]
LOCAL_DEPLOY_STATUS_PATH = Path(
    os.getenv("RIO_CONSOLE_DEPLOY_STATUS_PATH", "/run/rio-console/deploy-status.json")
)
DEPLOYMENT_STATUS_MAX_AGE_SECONDS = max(
    60, int(os.getenv("RIO_DEPLOYMENT_STATUS_MAX_AGE_SECONDS", "900"))
)

HEADERS = {"Authorization": f"Bearer {AGENT_TOKEN}"}
DISCORD_OAUTH_AUTHORIZE_URL = "https://discord.com/api/oauth2/authorize"
DISCORD_OAUTH_TOKEN_URL = "https://discord.com/api/oauth2/token"
DISCORD_API_USER_URL = "https://discord.com/api/users/@me"
OAUTH_STATE_COOKIE = "rio_console_oauth_state"
SESSION_COOKIE = "rio_console_session"


class OAuthConfig(BaseModel):
    client_id: str
    client_secret: str
    redirect_uri: str
    session_secret: str


class RuntimeSettingWrite(BaseModel):
    value: str
    request_id: str


class PolicySettingWrite(BaseModel):
    value: str
    request_id: str


class DeploymentCheck(BaseModel):
    name: str
    status: Literal["passed", "failed", "skipped", "unknown"]
    at: datetime
    detail: str | None = None


class DeploymentStatusRecord(BaseModel):
    schema_version: Literal[1]
    deployment_id: str
    component: str
    target_revision: str | None = None
    running_revision: str | None = None
    status: Literal["queued", "running", "succeeded", "failed", "stale", "unknown"]
    phase: str
    started_at: datetime | None = None
    finished_at: datetime | None = None
    verified_at: datetime | None = None
    checks: list[DeploymentCheck] = Field(default_factory=list)
    previous_revision: str | None = None
    log_ref: str | None = None
    error: str | None = None


def unknown_deployment_status(detail: str) -> dict:
    return DeploymentStatusRecord(
        schema_version=1,
        deployment_id="console-observation-unconfigured",
        component="console",
        status="unknown",
        phase="observation",
        error=detail,
    ).model_dump(mode="json")


def oauth_config() -> OAuthConfig | None:
    values = {
        "client_id": os.getenv("RIO_CONSOLE_DISCORD_CLIENT_ID", "").strip(),
        "client_secret": os.getenv("RIO_CONSOLE_DISCORD_CLIENT_SECRET", "").strip(),
        "redirect_uri": os.getenv("RIO_CONSOLE_DISCORD_REDIRECT_URI", "").strip(),
        "session_secret": os.getenv("RIO_CONSOLE_SESSION_SECRET", "").strip(),
    }
    if not any(values.values()):
        return None
    if not all(values.values()) or len(values["session_secret"]) < 32:
        raise HTTPException(status_code=503, detail="Discord OAuth is misconfigured")
    return OAuthConfig(**values)


def secure_cookie() -> bool:
    return os.getenv("RIO_CONSOLE_SESSION_COOKIE_SECURE", "true").lower() not in {
        "0",
        "false",
        "no",
    }


def _signed_value(payload: dict[str, object], secret: str) -> str:
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).rstrip(b"=")
    signature = hmac.digest(secret.encode("utf-8"), encoded, "sha256")
    return f"{encoded.decode('ascii')}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode('ascii')}"


def _verified_value(value: str | None, secret: str) -> dict[str, object] | None:
    if not value or "." not in value:
        return None
    encoded, supplied_signature = value.rsplit(".", 1)
    expected_signature = base64.urlsafe_b64encode(
        hmac.digest(secret.encode("utf-8"), encoded.encode("ascii"), "sha256")
    ).rstrip(b"=").decode("ascii")
    if not hmac.compare_digest(supplied_signature, expected_signature):
        return None
    try:
        padding = "=" * (-len(encoded) % 4)
        payload = json.loads(base64.urlsafe_b64decode(f"{encoded}{padding}"))
    except (UnicodeDecodeError, ValueError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def session_actor(request: Request) -> dict[str, str] | None:
    config = oauth_config()
    if config is None:
        return None
    payload = _verified_value(request.cookies.get(SESSION_COOKIE), config.session_secret)
    if (
        not payload
        or payload.get("purpose") != "session"
        or not isinstance(payload.get("id"), str)
        or payload.get("role") not in {"viewer", "admin"}
        or not isinstance(payload.get("expires_at"), int)
        or payload["expires_at"] < int(time.time())
    ):
        return None
    return {"id": payload["id"], "role": payload["role"]}


def require_admin(request: Request) -> dict[str, str]:
    actor = session_actor(request)
    if actor is None:
        raise HTTPException(status_code=401, detail="Discord login is required")
    if actor["role"] != "admin":
        raise HTTPException(status_code=403, detail="Discord bot administrator access is required")
    return actor


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


async def agent_post(path: str, payload: dict | None = None):
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(f"{AGENT_URL}{path}", headers=HEADERS, json=payload)

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Agent error: {response.text}")

    return response.json()


async def agent_write(method: str, path: str, payload: dict):
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.request(method, f"{AGENT_URL}{path}", headers=HEADERS, json=payload)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Runtime settings agent is unavailable") from exc
    if response.is_success:
        try:
            return response.json()
        except ValueError as exc:
            raise HTTPException(status_code=502, detail="Runtime settings agent returned invalid JSON") from exc
    if response.status_code in {400, 401, 403}:
        try:
            detail = response.json().get("detail")
        except ValueError:
            detail = None
        raise HTTPException(
            status_code=response.status_code,
            detail=detail if isinstance(detail, str) and len(detail) <= 300 else "Runtime settings request failed",
        )
    raise HTTPException(status_code=502, detail="Runtime settings agent request failed")


@app.get("/auth/discord/login")
async def discord_login():
    config = oauth_config()
    if config is None:
        raise HTTPException(status_code=503, detail="Discord OAuth is not configured")
    state = secrets.token_urlsafe(32)
    response = RedirectResponse(
        f"{DISCORD_OAUTH_AUTHORIZE_URL}?{urlencode({'client_id': config.client_id, 'redirect_uri': config.redirect_uri, 'response_type': 'code', 'scope': 'identify', 'state': state})}",
        status_code=302,
    )
    response.set_cookie(
        OAUTH_STATE_COOKIE,
        _signed_value(
            {"purpose": "oauth_state", "state": state, "expires_at": int(time.time()) + 300},
            config.session_secret,
        ),
        httponly=True,
        secure=secure_cookie(),
        samesite="lax",
        max_age=300,
        path="/auth/discord",
    )
    return response


@app.get("/auth/discord/callback")
async def discord_callback(code: str, state: str, request: Request):
    config = oauth_config()
    if config is None:
        raise HTTPException(status_code=503, detail="Discord OAuth is not configured")
    state_payload = _verified_value(request.cookies.get(OAUTH_STATE_COOKIE), config.session_secret)
    if (
        not state_payload
        or state_payload.get("purpose") != "oauth_state"
        or not isinstance(state_payload.get("state"), str)
        or not isinstance(state_payload.get("expires_at"), int)
        or state_payload["expires_at"] < int(time.time())
        or not hmac.compare_digest(state, state_payload["state"])
    ):
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token_response = await client.post(
                DISCORD_OAUTH_TOKEN_URL,
                data={
                    "client_id": config.client_id,
                    "client_secret": config.client_secret,
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": config.redirect_uri,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            token_response.raise_for_status()
            access_token = token_response.json().get("access_token")
            if not isinstance(access_token, str):
                raise ValueError("Discord did not return an access token")
            user_response = await client.get(
                DISCORD_API_USER_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            user_response.raise_for_status()
            user_id = user_response.json().get("id")
    except (httpx.HTTPError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail="Discord login failed") from exc
    if not isinstance(user_id, str) or not user_id.isdigit():
        raise HTTPException(status_code=502, detail="Discord login returned an invalid identity")
    actor = await agent_post("/auth/discord-user", {"user_id": user_id})
    if not isinstance(actor, dict) or actor.get("role") not in {"viewer", "admin"}:
        raise HTTPException(status_code=502, detail="Console authorization failed")
    response = RedirectResponse("/", status_code=302)
    response.delete_cookie(OAUTH_STATE_COOKIE, path="/auth/discord")
    response.set_cookie(
        SESSION_COOKIE,
        _signed_value(
            {
                "purpose": "session",
                "id": user_id,
                "role": actor["role"],
                "expires_at": int(time.time()) + 8 * 60 * 60,
            },
            config.session_secret,
        ),
        httponly=True,
        secure=secure_cookie(),
        samesite="strict",
        max_age=8 * 60 * 60,
        path="/",
    )
    return response


@app.get("/api/auth/me")
async def auth_me(request: Request):
    return {"oauth_enabled": oauth_config() is not None, "actor": session_actor(request)}


@app.post("/api/auth/logout")
async def auth_logout():
    response = RedirectResponse("/", status_code=303)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


def local_deployment_status() -> dict:
    try:
        value = json.loads(LOCAL_DEPLOY_STATUS_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return unknown_deployment_status(
            "Host deployment status has not been configured yet."
        )
    except (OSError, json.JSONDecodeError):
        return unknown_deployment_status("Host deployment status file is unreadable.")
    try:
        record = DeploymentStatusRecord.model_validate(value)
    except ValidationError:
        return unknown_deployment_status("Invalid deployment status data.")

    if record.component != "console":
        return unknown_deployment_status("Deployment status component must be console.")
    if record.status == "succeeded":
        if not record.target_revision or not record.running_revision:
            return unknown_deployment_status(
                "A successful deployment is missing revision attestation."
            )
        if record.target_revision != record.running_revision:
            return unknown_deployment_status(
                "Deployment target and running revisions do not match."
            )
        if record.verified_at is None:
            return unknown_deployment_status(
                "A successful deployment is missing its verification time."
            )
        if not record.checks or any(check.status != "passed" for check in record.checks):
            return unknown_deployment_status(
                "A successful deployment is missing passing readiness checks."
            )
        age_seconds = (datetime.now(timezone.utc) - record.verified_at).total_seconds()
        if age_seconds > DEPLOYMENT_STATUS_MAX_AGE_SECONDS:
            record.status = "stale"
            record.error = "Deployment verification is older than the freshness window."
    return record.model_dump(mode="json")


@app.get("/healthz")
async def healthz():
    """Container-local readiness probe; it does not expose Agent data."""
    return {"ready": True}


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


@app.get("/api/traces")
async def traces(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    limit: int = 50,
    cursor: str | None = None,
):
    """Proxy bounded, content-free Agent trace metadata only."""
    limit = max(1, min(limit, 100))
    query = {"limit": str(limit)}
    if from_:
        query["from"] = from_.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if to:
        query["to"] = to.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if cursor:
        query["cursor"] = cursor
    return await agent_get(f"/traces?{urlencode(query)}")


@app.get("/api/traces/{turn_id}")
async def trace_detail(turn_id: uuid.UUID):
    return await agent_get(f"/traces/{turn_id}")


@app.get("/api/runtime-events")
async def runtime_events(lines: int = 50):
    """Public console route kept distinct from the agent's /events endpoint."""
    return await events(lines)


@app.get("/api/deployments")
async def deployments():
    agent = await agent_get("/deployments")
    return {"console": local_deployment_status(), **agent}


@app.get("/api/settings/runtime")
async def runtime_settings():
    return await agent_get("/settings/runtime")


@app.get("/api/settings/policies")
async def policy_settings():
    return await agent_get("/settings/policies")


@app.put("/api/settings/policies/{policy}/{scope:path}")
async def set_policy_setting(policy: str, scope: str, write: PolicySettingWrite, request: Request):
    actor = require_admin(request)
    return await agent_write(
        "PUT", f"/settings/policies/{policy}/{scope}",
        {"value": write.value, "request_id": write.request_id, "actor_id": actor["id"]},
    )


@app.put("/api/settings/runtime/{key}")
async def set_runtime_setting(key: str, write: RuntimeSettingWrite, request: Request):
    actor = require_admin(request)
    return await agent_write(
        "PUT", f"/settings/runtime/{key}",
        {"value": write.value, "request_id": write.request_id, "actor_id": actor["id"]},
    )


@app.delete("/api/settings/runtime/{key}")
async def reset_runtime_setting(key: str, write: RuntimeSettingWrite, request: Request):
    actor = require_admin(request)
    return await agent_write(
        "DELETE", f"/settings/runtime/{key}",
        {"request_id": write.request_id, "actor_id": actor["id"]},
    )


@app.get("/api/settings/audit-events")
async def runtime_config_audit_events(limit: int = 50):
    return await agent_get(f"/settings/audit-events?limit={max(1, min(limit, 100))}")


@app.get("/api/operations")
async def operations(limit: int = 50):
    return await agent_get(f"/operations?limit={max(1, min(limit, 100))}")


@app.post("/api/bot/start")
async def bot_start(request: Request):
    actor = require_admin(request)
    return await agent_post(
        "/bot/start", {"actor_id": actor["id"], "request_id": str(uuid.uuid4())}
    )


@app.post("/api/bot/stop")
async def bot_stop(request: Request):
    actor = require_admin(request)
    return await agent_post(
        "/bot/stop", {"actor_id": actor["id"], "request_id": str(uuid.uuid4())}
    )


@app.post("/api/bot/restart")
async def bot_restart(request: Request):
    actor = require_admin(request)
    return await agent_post(
        "/bot/restart", {"actor_id": actor["id"], "request_id": str(uuid.uuid4())}
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


@app.get("/{client_path:path}", include_in_schema=False)
async def frontend(client_path: str):
    """Serve the Vue app for root and client-side routes after API routes."""
    if client_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Frontend asset not found.")

    asset_path = (FRONTEND_DIST / client_path).resolve()
    if asset_path.is_relative_to(FRONTEND_DIST.resolve()) and asset_path.is_file():
        return FileResponse(asset_path)

    if Path(client_path).suffix:
        raise HTTPException(status_code=404, detail="Frontend asset not found.")

    index_path = FRONTEND_DIST / "index.html"
    if not index_path.is_file():
        raise HTTPException(
            status_code=503,
            detail="Frontend bundle is unavailable. Run `npm run build` in frontend/.",
        )
    return FileResponse(index_path)

import os
import time
import json
from datetime import datetime, timedelta, timezone

os.environ.setdefault("RIO_AGENT_TOKEN", "test-token")

from fastapi.testclient import TestClient

import app as app_module


client = TestClient(app_module.app)


def test_status_combines_runtime_events(monkeypatch):
    async def fake_agent_get(path: str):
        if path == "/status":
            return {"online": True, "pid": 101}
        if path == "/events?lines=100":
            return {"events": [{"event": "discord.connected"}]}
        raise AssertionError(f"Unexpected path: {path}")

    monkeypatch.setattr(app_module, "agent_get", fake_agent_get)
    response = client.get("/api/status")

    assert response.status_code == 200
    assert response.json()["events"] == [{"event": "discord.connected"}]
    assert response.headers["cache-control"].startswith("no-store")


def test_control_route_preserves_agent_contract(monkeypatch):
    async def fake_agent_post(path: str, payload: dict):
        return {"ok": True, "path": path, "payload": payload}

    monkeypatch.setattr(app_module, "agent_post", fake_agent_post)
    monkeypatch.setattr(
        app_module,
        "session_actor",
        lambda request: {"id": "123456789012345678", "role": "admin"},
    )
    response = client.post("/api/bot/restart")

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert response.json()["path"] == "/bot/restart"
    assert response.json()["payload"]["actor_id"] == "123456789012345678"


def test_operations_route_preserves_agent_contract(monkeypatch):
    async def fake_agent_get(path: str):
        assert path == "/operations?limit=50"
        return {"operations": [{"operation_id": "op-1", "result": "success"}]}

    monkeypatch.setattr(app_module, "agent_get", fake_agent_get)
    response = client.get("/api/operations")

    assert response.status_code == 200
    assert response.json()["operations"][0]["operation_id"] == "op-1"


def test_control_route_rejects_anonymous_requests():
    response = client.post("/api/bot/restart")

    assert response.status_code == 401


def test_runtime_settings_route_preserves_agent_contract(monkeypatch):
    async def fake_agent_get(path: str):
        assert path == "/settings/runtime"
        return {"settings": [{"key": "chat_web_search", "value": True}]}

    monkeypatch.setattr(app_module, "agent_get", fake_agent_get)
    response = client.get("/api/settings/runtime")

    assert response.status_code == 200
    assert response.json()["settings"][0]["key"] == "chat_web_search"
    assert response.headers["cache-control"].startswith("no-store")


def test_runtime_audit_route_preserves_agent_contract(monkeypatch):
    async def fake_agent_get(path: str):
        assert path == "/settings/audit-events?limit=50"
        return {"events": [{"target": "CHAT_WEB_SEARCH", "outcome": "success"}]}

    monkeypatch.setattr(app_module, "agent_get", fake_agent_get)
    response = client.get("/api/settings/audit-events")

    assert response.status_code == 200
    assert response.json()["events"][0]["target"] == "CHAT_WEB_SEARCH"
    assert response.headers["cache-control"].startswith("no-store")


def test_trace_route_preserves_bounded_agent_query(monkeypatch):
    async def fake_agent_get(path: str):
        assert path == "/traces?limit=100"
        return {"source_status": "HEALTHY", "traces": [], "next_cursor": None}

    monkeypatch.setattr(app_module, "agent_get", fake_agent_get)
    response = client.get("/api/traces?limit=999")

    assert response.status_code == 200
    assert response.json()["source_status"] == "HEALTHY"


def test_usage_route_limits_window_and_keeps_agent_grouping(monkeypatch):
    async def fake_agent_get(path: str):
        assert path.startswith("/analytics/usage?")
        assert "group_by=model" in path and "limit=500" in path
        return {"source_status": "HEALTHY", "group_by": "model", "groups": []}

    monkeypatch.setattr(app_module, "agent_get", fake_agent_get)
    response = client.get("/api/analytics/usage?window_hours=9999&group_by=model")

    assert response.status_code == 200
    assert response.json()["group_by"] == "model"


def _configure_discord_oauth(monkeypatch):
    monkeypatch.setenv("RIO_CONSOLE_DISCORD_CLIENT_ID", "123456789012345678")
    monkeypatch.setenv("RIO_CONSOLE_DISCORD_CLIENT_SECRET", "client-secret")
    monkeypatch.setenv(
        "RIO_CONSOLE_DISCORD_REDIRECT_URI",
        "https://console.example/auth/discord/callback",
    )
    monkeypatch.setenv("RIO_CONSOLE_SESSION_SECRET", "s" * 32)
    monkeypatch.setenv("RIO_CONSOLE_SESSION_COOKIE_SECURE", "false")


def test_discord_login_redirects_with_signed_state(monkeypatch):
    _configure_discord_oauth(monkeypatch)

    response = client.get("/auth/discord/login", follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"].startswith(app_module.DISCORD_OAUTH_AUTHORIZE_URL)
    assert "scope=identify" in response.headers["location"]
    assert app_module.OAUTH_STATE_COOKIE in response.headers["set-cookie"]


def test_auth_me_reads_only_a_valid_signed_session(monkeypatch):
    _configure_discord_oauth(monkeypatch)
    session = app_module._signed_value(
        {
            "purpose": "session",
            "id": "123456789012345678",
            "role": "admin",
            "expires_at": int(time.time()) + 60,
        },
        "s" * 32,
    )
    client.cookies.set(app_module.SESSION_COOKIE, session)

    response = client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json() == {
        "oauth_enabled": True,
        "actor": {"id": "123456789012345678", "role": "admin"},
    }


def test_vue_history_fallback_uses_the_built_index():
    root = client.get("/")
    nested = client.get("/settings")

    assert root.status_code == 200
    assert nested.status_code == 200
    assert root.content == nested.content


def test_unknown_asset_is_not_rewritten_to_html():
    response = client.get("/missing.js")

    assert response.status_code == 404


def test_existing_frontend_asset_is_served():
    response = client.get("/favicon.png")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"


def test_unknown_api_route_is_not_rewritten_to_html():
    response = client.get("/api/missing")

    assert response.status_code == 404


def test_healthz_is_available_without_agent_connectivity():
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"ready": True}


def _deployment_status(verified_at: datetime) -> dict:
    timestamp = verified_at.isoformat().replace("+00:00", "Z")
    return {
        "schema_version": 1,
        "deployment_id": "dep-console-test",
        "component": "console",
        "target_revision": "abc1234",
        "running_revision": "abc1234",
        "status": "succeeded",
        "phase": "readiness",
        "started_at": timestamp,
        "finished_at": timestamp,
        "verified_at": timestamp,
        "checks": [
            {
                "name": "container-http",
                "status": "passed",
                "at": timestamp,
            }
        ],
        "previous_revision": None,
        "log_ref": "journal:dep-console-test",
        "error": None,
    }


def test_local_deployment_status_requires_a_v1_record(monkeypatch, tmp_path):
    monkeypatch.setattr(app_module, "LOCAL_DEPLOY_STATUS_PATH", tmp_path / "missing.json")

    result = app_module.local_deployment_status()

    assert result["schema_version"] == 1
    assert result["status"] == "unknown"
    assert "not been configured" in result["error"]


def test_local_deployment_status_marks_expired_verification_stale(monkeypatch, tmp_path):
    status_path = tmp_path / "deploy-status.json"
    status_path.write_text(
        json.dumps(_deployment_status(datetime.now(timezone.utc) - timedelta(hours=1))),
        encoding="utf-8",
    )
    monkeypatch.setattr(app_module, "LOCAL_DEPLOY_STATUS_PATH", status_path)
    monkeypatch.setattr(app_module, "DEPLOYMENT_STATUS_MAX_AGE_SECONDS", 60)

    result = app_module.local_deployment_status()

    assert result["status"] == "stale"
    assert "freshness window" in result["error"]


def test_local_deployment_status_preserves_fresh_verified_success(monkeypatch, tmp_path):
    status_path = tmp_path / "deploy-status.json"
    status_path.write_text(
        json.dumps(_deployment_status(datetime.now(timezone.utc))), encoding="utf-8"
    )
    monkeypatch.setattr(app_module, "LOCAL_DEPLOY_STATUS_PATH", status_path)

    result = app_module.local_deployment_status()

    assert result["status"] == "succeeded"
    assert result["running_revision"] == "abc1234"


def test_local_deployment_status_rejects_unattested_success(monkeypatch, tmp_path):
    status_path = tmp_path / "deploy-status.json"
    record = _deployment_status(datetime.now(timezone.utc))
    record["running_revision"] = "def5678"
    status_path.write_text(json.dumps(record), encoding="utf-8")
    monkeypatch.setattr(app_module, "LOCAL_DEPLOY_STATUS_PATH", status_path)

    result = app_module.local_deployment_status()

    assert result["status"] == "unknown"
    assert "do not match" in result["error"]

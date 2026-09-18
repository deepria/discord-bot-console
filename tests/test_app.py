import os

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
    async def fake_agent_post(path: str):
        return {"ok": True, "path": path}

    monkeypatch.setattr(app_module, "agent_post", fake_agent_post)
    response = client.post("/api/bot/restart")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "path": "/bot/restart"}


def test_vue_history_fallback_uses_the_built_index():
    root = client.get("/")
    nested = client.get("/settings")

    assert root.status_code == 200
    assert nested.status_code == 200
    assert root.content == nested.content


def test_unknown_asset_is_not_rewritten_to_html():
    response = client.get("/missing.js")

    assert response.status_code == 404


def test_unknown_api_route_is_not_rewritten_to_html():
    response = client.get("/api/missing")

    assert response.status_code == 404

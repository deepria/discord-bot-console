import os
from uuid import uuid4

os.environ.setdefault("RIO_AGENT_TOKEN", "test-token")

import pytest
from fastapi.testclient import TestClient

import app as module

client = TestClient(module.app)


def body(**kwargs):
    return {"mode": "manual", "status": "dnd", "activity_type": "playing",
            "activity_text": "코드 수정 중", "request_id": str(uuid4()), **kwargs}


def test_presence_requires_admin_session(monkeypatch):
    monkeypatch.setattr(module, "session_actor", lambda request: None)
    assert client.put("/api/bot/presence", json=body()).status_code == 401
    monkeypatch.setattr(module, "session_actor", lambda request: {"id": "123", "role": "viewer"})
    assert client.put("/api/bot/presence", json=body()).status_code == 403


@pytest.mark.parametrize("changes", [{"status": "offline"}, {"activity_type": "streaming"},
                                     {"actor_id": "forged"}, {"request_id": "invalid"}])
def test_presence_rejects_bad_input_and_forged_actor(changes):
    assert client.put("/api/bot/presence", json=body(**changes)).status_code == 422


def test_presence_proxy_uses_server_actor_and_preserves_pending(monkeypatch):
    monkeypatch.setattr(module, "session_actor", lambda request: {"id": "123", "role": "admin"})

    async def proxy(method, path, payload):
        assert method == "PUT" and path == "/bot/presence"
        assert payload["actor_id"] == "123"
        return {"operation": {"state": "queued", "request_id": payload["request_id"]}}

    monkeypatch.setattr(module, "agent_write", proxy)
    response = client.put("/api/bot/presence", json=body())
    assert response.status_code == 202
    assert response.headers["cache-control"].startswith("no-store")


def test_presence_proxy_query(monkeypatch):
    request_id = str(uuid4())

    async def proxy(method, path, payload):
        assert method == "GET" and path == f"/bot/presence?request_id={request_id}"
        return {"connected": False}

    monkeypatch.setattr(module, "agent_write", proxy)
    assert client.get(f"/api/bot/presence?request_id={request_id}").json() == {"connected": False}

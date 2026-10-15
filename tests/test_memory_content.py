import hmac
import os

os.environ.setdefault("RIO_AGENT_TOKEN", "test-token")

import pytest
from fastapi.testclient import TestClient

import app as module


@pytest.mark.parametrize("actor,expected", [(None, 401), ({"id": "7", "role": "viewer"}, 403)])
def test_memory_content_requires_admin_before_agent_request(monkeypatch, actor, expected):
    monkeypatch.setattr(module, "session_actor", lambda request: actor)
    async def no_read(*args, **kwargs):
        pytest.fail("unauthorized request reached Agent")
    monkeypatch.setattr(module, "agent_get", no_read)
    assert TestClient(module.app).get("/api/memory/1?include_content=true").status_code == expected


def test_memory_content_proxy_signs_server_actor_and_explicit_content_request(monkeypatch):
    monkeypatch.setattr(module, "session_actor", lambda request: {"id": "42", "role": "admin"})
    monkeypatch.setenv("RIO_CONSOLE_IDENTITY_SECRET", "test-identity")
    async def read(path, headers):
        assert path == "/memory/1?include_content=true"
        assert headers["X-Rio-Actor-Id"] == "42"
        at = headers["X-Rio-Actor-Timestamp"]
        expected = hmac.new(b"test-identity", f"42.{at}".encode(), "sha256").hexdigest()
        assert headers["X-Rio-Actor-Signature"] == expected
        return {"memory": {"id": 1, "content": "synthetic candidate"}}
    monkeypatch.setattr(module, "agent_get", read)
    response = TestClient(module.app).get("/api/memory/1?include_content=true&actor_id=forged")
    assert response.status_code == 200
    assert response.json()["memory"]["content"] == "synthetic candidate"
    assert response.headers["cache-control"].startswith("no-store")


def test_memory_content_missing_signing_configuration_does_not_read(monkeypatch):
    monkeypatch.setattr(module, "session_actor", lambda request: {"id": "42", "role": "admin"})
    monkeypatch.delenv("RIO_CONSOLE_IDENTITY_SECRET", raising=False)
    assert TestClient(module.app).get("/api/memory/1?include_content=true").status_code == 503

import os
os.environ.setdefault("RIO_AGENT_TOKEN", "test-token")

import pytest
from fastapi.testclient import TestClient
import app as module


def test_public_owner_filter_is_forwarded_with_cursor(monkeypatch):
    async def read(path):
        assert path == "/memory?limit=50&owner_id=99&cursor=10"
        return {"memory": [], "next_cursor": None}
    monkeypatch.setattr(module, "agent_get", read)
    assert TestClient(module.app).get("/api/memory?owner_id=99&cursor=10").status_code == 200


@pytest.mark.parametrize("owner", ["99 OR 1=1", "９９", "-1", "1" * 31])
def test_invalid_owner_does_not_reach_agent(monkeypatch, owner):
    async def forbidden(path):
        pytest.fail("invalid filter reached Agent")
    monkeypatch.setattr(module, "agent_get", forbidden)
    assert TestClient(module.app).get("/api/memory", params={"owner_id": owner}).status_code == 422

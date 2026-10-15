import os

os.environ.setdefault("RIO_AGENT_TOKEN", "test-token")

from fastapi.testclient import TestClient

import app as module


def test_memory_evaluation_is_a_public_read_without_item_detail_authorization(monkeypatch):
    async def agent_get(path):
        assert path == "/memory/evaluation"
        return {"evaluation": {"readiness": {"ready_for_metadata_review": False}}}
    monkeypatch.setattr(module, "agent_get", agent_get)
    client = TestClient(module.app)
    response = client.get("/api/memory/evaluation")
    assert response.status_code == 200
    assert response.json()["evaluation"]["readiness"]["ready_for_metadata_review"] is False
    assert response.headers["cache-control"].startswith("no-store")

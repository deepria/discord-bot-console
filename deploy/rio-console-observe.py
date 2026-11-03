#!/usr/bin/env python3
"""Publish verified Coolify/Docker observations; run on the deployment host."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def record() -> dict:
    return {
        "schema_version": 1, "component": "console",
        "deployment_id": "coolify-observation", "status": "unknown",
        "phase": "observation", "target_revision": None,
        "running_revision": None, "started_at": None, "finished_at": None,
        "verified_at": None, "previous_revision": None, "checks": [],
        "log_ref": None, "error": None,
    }


def evaluate(app: dict, deployment: dict | None, containers: list[dict], probe) -> dict:
    result = record()
    target = app.get("docker_registry_image_tag")
    if not isinstance(target, str) or not re.fullmatch(r"[0-9a-f]{40}", target):
        result["error"] = "Configured image tag must be a full commit SHA."
        return result
    result["target_revision"] = target
    expected_image = f"{app.get('docker_registry_image_name')}:{target}"
    running = [c for c in containers if c.get("running")]
    matches = [c for c in running if c.get("image") == expected_image
               and c.get("revision") == target]
    current = (matches or running or [None])[0]
    if current:
        revision = current.get("revision")
        if isinstance(revision, str) and re.fullmatch(r"[0-9a-f]{40}", revision):
            result["running_revision"] = revision
    if not deployment:
        result["error"] = "No Coolify deployment record is available."
        return result
    result.update(deployment_id=f"coolify-{deployment.get('deployment_uuid', 'unknown')}",
                  started_at=deployment.get("created_at"))
    state = deployment.get("status", "unknown")
    if state in {"failed", "cancelled"} or str(state).startswith("cancelled-"):
        result.update(status="failed", phase="coolify-deployment",
                      finished_at=deployment.get("updated_at"),
                      error="The latest Coolify deployment failed or was cancelled.")
        return result
    if state in {"queued", "in_progress"}:
        result.update(status="queued" if state == "queued" else "running",
                      phase="coolify-deployment")
        return result
    if state != "finished":
        result["error"] = "The latest Coolify deployment is not confirmed finished."
        return result
    if len(matches) != 1 or len(running) != 1:
        result.update(status="running", phase="revision-attestation",
                      error="Waiting for one running container matching the configured image and SHA.")
        return result
    current = matches[0]
    timestamp = now()
    checks = [{"name": "docker-health", "status": "passed" if current.get("health") == "healthy" else "failed", "at": timestamp}]
    if current.get("health") == "healthy":
        # Real HTTP readiness and Agent authentication, not merely API job success.
        for name in ("container-http", "agent-connectivity"):
            checks.append({"name": name, "status": "passed" if probe(current["name"], name) else "failed", "at": now()})
    result["checks"] = checks
    if len(checks) != 3 or any(c["status"] != "passed" for c in checks):
        result.update(status="failed", phase="readiness",
                      error="The observed container or Agent failed readiness checks.")
        return result
    result.update(status="succeeded", phase="observation", verified_at=now(),
                  finished_at=deployment.get("updated_at"))
    return result


def api_get(base: str, path: str, token: str) -> dict:
    request = urllib.request.Request(base.rstrip("/") + path, headers={
        "Authorization": "Bearer " + token,
        "Host": "coolify.deepria.com", "Accept": "application/json",
    })
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def run(*args: str, timeout: int = 15) -> str:
    return subprocess.check_output(args, text=True, timeout=timeout, stderr=subprocess.DEVNULL)


def docker_containers(uuid: str) -> list[dict]:
    names = run("docker", "ps", "--filter", f"name=^/{uuid}(-|$)", "--format", "{{.Names}}").splitlines()
    if not names:
        return []
    template = ('{"name":{{json .Name}},"image":{{json .Config.Image}},'
                '"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}},'
                '"running":{{json .State.Running}},'
                '"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}"none"{{end}}}')
    containers = [json.loads(line) for line in run("docker", "inspect", "--format", template, *names).splitlines()]
    for container in containers:
        container["name"] = container["name"].lstrip("/")
    return containers


def docker_probe(container: str, name: str) -> bool:
    if name == "container-http":
        code = 'import httpx; raise SystemExit(0 if httpx.get("http://127.0.0.1:8000/healthz", timeout=5).status_code == 200 else 1)'
    else:
        code = ('import os,httpx; raise SystemExit(0 if httpx.get(os.environ["RIO_AGENT_URL"].rstrip("/") + "/health", '
                'headers={"Authorization":"Bearer " + os.environ["RIO_AGENT_TOKEN"]}, timeout=5).status_code == 200 else 1)')
    try:
        run("docker", "exec", container, "python", "-c", code, timeout=10)
        return True
    except (subprocess.SubprocessError, OSError):
        return False


def publish(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as file:
            temporary = Path(file.name)
            json.dump(payload, file, separators=(",", ":"))
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
            os.fchmod(file.fileno(), 0o644)
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--application-uuid", required=True)
    parser.add_argument("--token-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--api-base", default="http://127.0.0.1:8000/api/v1")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-zA-Z0-9]{16,64}", args.application_uuid):
        parser.error("invalid application UUID")
    try:
        token = args.token_file.read_text().strip()
        if not token:
            raise ValueError("empty token")
        app = api_get(args.api_base, f"/applications/{args.application_uuid}", token)
        if app.get("uuid") != args.application_uuid or app.get("build_pack") != "dockerimage":
            raise ValueError("unexpected application")
        history = api_get(args.api_base, f"/deployments/applications/{args.application_uuid}?take=1", token)
        rows = history.get("deployments", []) if isinstance(history, dict) else history
        if isinstance(rows, dict):
            rows = list(rows.values())
        payload = evaluate(app, rows[0] if rows else None, docker_containers(args.application_uuid), docker_probe)
    except (OSError, ValueError, KeyError, TypeError, urllib.error.URLError, subprocess.SubprocessError) as error:
        payload = record()
        # Never put raw API bodies, request headers, subprocess output or secrets in the public file.
        payload["error"] = f"Observer could not verify current state ({type(error).__name__})."
    try:
        previous = json.loads(args.output.read_text())
        prior = previous.get("running_revision")
        payload["previous_revision"] = prior if prior and prior != payload.get("running_revision") else previous.get("previous_revision")
    except (OSError, ValueError, AttributeError):
        pass
    publish(args.output, payload)
    print(f"Console observation: {payload['status']} ({payload['phase']})")


if __name__ == "__main__":
    main()

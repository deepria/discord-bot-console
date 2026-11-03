#!/usr/bin/env python3
"""Deploy a published SHA image and verify its runtime through Deploy Watch."""

from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone


class DeploymentError(Exception):
    pass


class RequestError(DeploymentError):
    def __init__(self, status: int | None, headers=None):
        self.status = status
        headers = headers or {}
        content_type = headers.get("Content-Type", "").split(";", 1)[0].lower()
        self.response_type = content_type if content_type in {"application/json", "text/html", "text/plain"} else "other"
        self.challenge = headers.get("cf-mitigated", "").lower() == "challenge"
        ray = headers.get("cf-ray", "")
        self.ray = ray if re.fullmatch(r"[a-fA-F0-9]{8,32}-[A-Z0-9]{2,8}", ray) else None
        message = f"HTTP {status}" if status else "connection failed"
        if status:
            message += f"; response={self.response_type}; challenge={self.challenge}"
            if self.ray:
                message += f"; cf-ray={self.ray}"
        super().__init__(message)

    @property
    def retryable(self) -> bool:
        return self.status is None or self.status in {404, 429, 500, 502, 503, 504}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def request_json(url: str, method: str = "GET", headers: dict | None = None, body=None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, method=method, data=data, headers={
        "Accept": "application/json", "Cache-Control": "no-cache",
        "User-Agent": "rio-console-deployer/1.0",
        **({"Content-Type": "application/json"} if body is not None else {}),
        **(headers or {}),
    })
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=20) as response:
            if response.status != 200:
                raise RequestError(response.status, response.headers)
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Do not echo response bodies or headers: they may contain secrets or login pages.
        raise RequestError(error.code, error.headers) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise RequestError(None) from None
    except (ValueError, UnicodeError):
        raise DeploymentError("Expected a JSON response.") from None


class CoolifyClient:
    def __init__(self, base: str, client_id: str, client_secret: str, config_token: str, deploy_token: str):
        self.base = base.rstrip("/") + "/api/v1"
        self.access = {"CF-Access-Client-Id": client_id, "CF-Access-Client-Secret": client_secret}
        self.config_token = config_token
        self.deploy_token = deploy_token

    def call(self, method: str, path: str, body=None, *, deploy: bool = False):
        token = self.deploy_token if deploy else self.config_token
        return request_json(self.base + path, method,
                            self.access | {"Authorization": "Bearer " + token}, body)

    def diagnose_read_access(self) -> None:
        # Fixed read-only probes; response bodies, credentials and redirect locations stay private.
        for name, headers in [
            ("Cloudflare-only probe (expected HTTP 401)", self.access),
            ("Cloudflare+config probe (expected HTTP 200)",
             self.access | {"Authorization": "Bearer " + self.config_token}),
        ]:
            try:
                request_json(self.base + "/teams/current", headers=headers)
                print(name + ": HTTP 200", flush=True)
            except DeploymentError as error:
                print(name + ": " + str(error), flush=True)


def verify_application(app: dict, uuid: str, image: str) -> None:
    if (not isinstance(app, dict) or app.get("uuid") != uuid
            or app.get("build_pack") != "dockerimage"
            or app.get("docker_registry_image_name") != image):
        raise DeploymentError("Application UUID, deployment type or image repository does not match.")


def verified_observation(payload: dict, revision: str, deployment_uuid: str, not_before: datetime) -> bool:
    if not isinstance(payload, dict):
        return False
    state = payload.get("console")
    if not isinstance(state, dict):
        return False
    if (state.get("status") != "succeeded"
            or state.get("target_revision") != revision
            or state.get("running_revision") != revision
            or state.get("deployment_id") != "coolify-" + deployment_uuid):
        return False
    try:
        verified = datetime.fromisoformat(state["verified_at"].replace("Z", "+00:00"))
        if (verified.tzinfo is None or verified < not_before
                or verified > datetime.now(timezone.utc) + timedelta(seconds=30)):
            return False
    except (KeyError, TypeError, ValueError, AttributeError):
        return False
    checks = state.get("checks")
    if not isinstance(checks, list) or not checks or any(
        not isinstance(check, dict) or check.get("status") != "passed" for check in checks
    ):
        return False
    return {"docker-health", "container-http", "agent-connectivity"}.issubset(
        {check.get("name") for check in checks}
    )


def wait_for_runtime(client: CoolifyClient, rio_url: str, uuid: str, image: str,
                     revision: str, deployment_uuid: str, not_before: datetime,
                     timeout: float = 900, interval: float = 10) -> None:
    deadline = time.monotonic() + timeout
    last_stage = None
    while True:
        stage = "waiting for Coolify deployment"
        try:
            deployment = client.call("GET", "/deployments/" + deployment_uuid)
            if not isinstance(deployment, dict) or deployment.get("deployment_uuid") != deployment_uuid:
                raise DeploymentError("Unexpected deployment response.")
            status = deployment.get("status", "unknown")
            if status in {"failed", "cancelled"} or str(status).startswith("cancelled-"):
                raise DeploymentError("Coolify reported a failed or cancelled deployment.")
            if status == "finished":
                app = client.call("GET", "/applications/" + uuid)
                verify_application(app, uuid, image)
                if app.get("docker_registry_image_tag") != revision:
                    raise DeploymentError("The configured image tag changed during deployment.")
                stage = "waiting for fresh Docker and Agent revision verification"
                # Rio is public; never forward Coolify/Cloudflare credentials to this origin.
                observation = request_json(rio_url.rstrip("/") + "/api/deployments")
                if verified_observation(observation, revision, deployment_uuid, not_before):
                    return
        except RequestError as error:
            if not error.retryable:
                raise DeploymentError(f"Deployment verification request rejected ({error}).") from None
            stage = "waiting after transient verification request failure"
        if stage != last_stage:
            print(stage, flush=True)
            last_stage = stage
        if time.monotonic() >= deadline:
            raise DeploymentError("Timed out before the requested deployment had fresh matching runtime verification.")
        time.sleep(interval)


def deploy(client: CoolifyClient, rio_url: str, uuid: str, image: str, revision: str,
           timeout: float = 900, interval: float = 10) -> dict:
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise DeploymentError("Target revision must be a full commit SHA.")
    app = client.call("GET", "/applications/" + uuid)
    verify_application(app, uuid, image)
    previous = app.get("docker_registry_image_tag")
    previous = previous if isinstance(previous, str) and re.fullmatch(r"[0-9a-f]{40}", previous) else None
    print("Previous image tag:", previous or "not a recorded SHA", flush=True)
    # Mutations are intentionally not retried: retrying POST could enqueue duplicates.
    client.call("PATCH", "/applications/" + uuid,
                {"docker_registry_image_tag": revision, "instant_deploy": False})
    updated = client.call("GET", "/applications/" + uuid)
    verify_application(updated, uuid, image)
    if updated.get("docker_registry_image_tag") != revision:
        raise DeploymentError("Coolify did not retain the requested SHA tag; deployment was not triggered.")
    not_before = datetime.now(timezone.utc)
    response = client.call("POST", "/deploy", {"uuid": uuid}, deploy=True)
    rows = response.get("deployments", []) if isinstance(response, dict) else []
    matches = [row for row in rows if isinstance(row, dict) and row.get("resource_uuid") == uuid]
    deployment_uuid = matches[0].get("deployment_uuid") if len(matches) == 1 else None
    if not isinstance(deployment_uuid, str) or not re.fullmatch(r"[a-zA-Z0-9_-]+", deployment_uuid):
        raise DeploymentError("Coolify did not return one deployment UUID for the application.")
    print("Requested deployment:", deployment_uuid, flush=True)
    wait_for_runtime(client, rio_url, uuid, image, revision, deployment_uuid, not_before, timeout, interval)
    print("Verified running revision:", revision, flush=True)
    return {"revision": revision, "previous_revision": previous, "deployment_uuid": deployment_uuid}


def require_origin(value: str) -> str:
    url = urllib.parse.urlsplit(value)
    if (url.scheme != "https" or not url.hostname or url.username or url.password
            or url.path not in {"", "/"} or url.query or url.fragment):
        raise DeploymentError("Deployment URLs must be HTTPS origins without credentials, paths or query strings.")
    return value.rstrip("/")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--revision", required=True)
    args = parser.parse_args()
    client = None
    try:
        names = ["CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET", "COOLIFY_CONFIG_TOKEN", "COOLIFY_DEPLOY_TOKEN"]
        if any(not os.environ.get(name, "").strip() for name in names):
            raise DeploymentError("One or more required deployment secrets are missing.")
        uuid = os.environ["COOLIFY_APPLICATION_UUID"]
        if not re.fullmatch(r"[a-zA-Z0-9]{16,64}", uuid):
            raise DeploymentError("Invalid application UUID.")
        base = require_origin(os.environ["COOLIFY_BASE_URL"])
        rio = require_origin(os.environ["RIO_CONSOLE_URL"])
        client = CoolifyClient(base, *(os.environ[name].strip() for name in names))
        result = deploy(client, rio, uuid, os.environ["RIO_IMAGE_NAME"], args.revision)
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a", encoding="utf-8") as file:
                file.write(f"\nDeployed and runtime-verified SHA: `{result['revision']}`\n\n")
                file.write(f"Previous SHA: `{result['previous_revision'] or 'unrecorded'}`\n\n")
                file.write(f"Coolify deployment: `{result['deployment_uuid']}`\n")
    except (DeploymentError, KeyError) as error:
        message = str(error) if isinstance(error, DeploymentError) else "A required deployment setting is missing."
        print("Deployment failed:", message, flush=True)
        if isinstance(error, RequestError) and error.status in {401, 403} and client is not None:
            client.diagnose_read_access()
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()

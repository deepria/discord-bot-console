import importlib.util
import json
from pathlib import Path


spec = importlib.util.spec_from_file_location(
    "observer", Path(__file__).resolve().parents[1] / "deploy/rio-console-observe.py"
)
observer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(observer)

SHA = "a" * 40
OTHER = "b" * 40
IMAGE = "ghcr.io/deepria/discord-bot-console"


def app():
    return {"docker_registry_image_name": IMAGE, "docker_registry_image_tag": SHA}


def deployment(status="finished"):
    return {"deployment_uuid": "deployment1", "status": status, "commit": "HEAD",
            "docker_registry_image_tag": None,
            "created_at": "2026-11-03T05:18:46Z", "updated_at": "2026-11-03T05:19:25Z"}


def container(**changes):
    return {"name": "/app-container", "image": IMAGE + ":" + SHA,
            "revision": SHA, "running": True, "health": "healthy", **changes}


def test_success_uses_configured_sha_and_actual_revision_not_head():
    result = observer.evaluate(app(), deployment(), [container()], lambda *args: True)
    assert result["status"] == "succeeded"
    assert result["target_revision"] == result["running_revision"] == SHA
    assert result["verified_at"]
    assert len(result["checks"]) == 3


def test_failed_deployment_does_not_become_success_from_old_healthy_container():
    result = observer.evaluate(app(), deployment("failed"), [container()], lambda *args: True)
    assert result["status"] == "failed"
    assert result["verified_at"] is None


def test_pending_deployment_is_not_reported_finished():
    for state, expected in [("queued", "queued"), ("in_progress", "running")]:
        result = observer.evaluate(app(), deployment(state), [container()], lambda *args: True)
        assert result["status"] == expected
        assert result["verified_at"] is None


def test_wrong_revision_or_image_never_attests_success():
    for candidate in [container(revision=OTHER), container(image=IMAGE + ":" + OTHER)]:
        result = observer.evaluate(app(), deployment(), [candidate], lambda *args: True)
        assert result["status"] == "running"
        assert result["phase"] == "revision-attestation"
        assert result["verified_at"] is None


def test_rolling_replacement_waits_until_old_container_is_removed():
    result = observer.evaluate(app(), deployment(), [container(), container(revision=OTHER)], lambda *args: True)
    assert result["status"] != "succeeded"


def test_unhealthy_container_or_agent_failure_does_not_pass():
    result = observer.evaluate(app(), deployment(), [container(health="unhealthy")], lambda *args: True)
    assert result["status"] == "failed"
    result = observer.evaluate(app(), deployment(), [container()], lambda _, check: check != "agent-connectivity")
    assert result["status"] == "failed"
    assert result["verified_at"] is None


def test_missing_deployment_and_non_sha_tags_remain_unknown():
    assert observer.evaluate(app(), None, [container()], lambda *args: True)["status"] == "unknown"
    config = app()
    config["docker_registry_image_tag"] = "latest"
    assert observer.evaluate(config, deployment(), [container()], lambda *args: True)["status"] == "unknown"


def test_atomic_publish_replaces_existing_record_and_is_readable(tmp_path):
    path = tmp_path / "status/deploy-status.json"
    observer.publish(path, {"status": "succeeded"})
    observer.publish(path, {"status": "unknown"})
    assert json.loads(path.read_text()) == {"status": "unknown"}
    assert path.stat().st_mode & 0o777 == 0o644
    assert list(path.parent.iterdir()) == [path]


def test_cli_reads_real_http_api_and_clears_success_after_auth_failure(tmp_path):
    import os
    import subprocess
    import sys
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer

    uuid = "mbz2qkppo9ba8bhep6l1hond"
    secret = "fake-test-token-never-publish"
    token = tmp_path / "token"
    token.write_text(secret)
    fake_docker = tmp_path / "docker"
    fake_docker.write_text(
        "#!/usr/bin/env python3\nimport json,sys\n"
        "if sys.argv[1] == 'ps': print('" + uuid + "-test')\n"
        "elif sys.argv[1] == 'inspect': print(" + repr(json.dumps(container(name="/" + uuid + "-test"))) + ")\n"
        "elif sys.argv[1] != 'exec': sys.exit(1)\n"
    )
    fake_docker.chmod(0o755)

    class Handler(BaseHTTPRequestHandler):
        deny = False

        def do_GET(self):
            if self.deny or self.headers.get("Authorization") != "Bearer " + secret:
                self.send_response(401)
                self.end_headers()
                self.wfile.write(secret.encode())
                return
            body = app() | {"uuid": uuid, "build_pack": "dockerimage"}
            if "/deployments/" in self.path:
                body = {"deployments": [deployment()]}
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(body).encode())

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    output = tmp_path / "state/deploy-status.json"
    command = [sys.executable, str(Path(observer.__file__)),
               "--application-uuid", uuid, "--token-file", str(token),
               "--output", str(output),
               "--api-base", f"http://127.0.0.1:{server.server_port}/api/v1"]
    env = os.environ | {"PATH": str(tmp_path) + os.pathsep + os.environ["PATH"]}
    try:
        result = subprocess.run(command, env=env, text=True, capture_output=True, check=True)
        assert json.loads(output.read_text())["status"] == "succeeded"
        assert secret not in output.read_text() + result.stdout + result.stderr
        Handler.deny = True
        result = subprocess.run(command, env=env, text=True, capture_output=True, check=True)
        state = json.loads(output.read_text())
        assert state["status"] == "unknown"
        assert state["verified_at"] is None
        assert secret not in output.read_text() + result.stdout + result.stderr
    finally:
        server.shutdown()
        server.server_close()
        thread.join()

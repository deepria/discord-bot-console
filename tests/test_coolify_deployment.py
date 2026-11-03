import importlib.util
import json
import threading
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "coolify_deploy", Path(__file__).resolve().parents[1] / "scripts/deploy_coolify.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

SHA = "a" * 40
OLD = "b" * 40
UUID = "mbz2qkppo9ba8bhep6l1hond"
DEPLOYMENT = "deployment-123"
IMAGE = "ghcr.io/deepria/discord-bot-console"


def app(tag=SHA):
    return {"uuid": UUID, "build_pack": "dockerimage", "docker_registry_image_name": IMAGE,
            "docker_registry_image_tag": tag}


def observation():
    return {"console": {
        "status": "succeeded", "target_revision": SHA, "running_revision": SHA,
        "deployment_id": "coolify-" + DEPLOYMENT,
        "verified_at": datetime.now(timezone.utc).isoformat(),
        "checks": [{"name": name, "status": "passed"} for name in
                   ["docker-health", "container-http", "agent-connectivity"]],
    }}


def assert_rejected(call):
    try:
        call()
    except module.DeploymentError:
        return
    raise AssertionError("Expected a rejected deployment")


def test_accepts_only_fresh_matching_observation_for_this_deployment():
    start = datetime.now(timezone.utc) - timedelta(seconds=1)
    assert module.verified_observation(observation(), SHA, DEPLOYMENT, start)
    invalid = [
        {"status": "unknown"}, {"target_revision": OLD}, {"running_revision": OLD},
        {"deployment_id": "coolify-another-deployment"}, {"checks": []},
        {"verified_at": (start - timedelta(seconds=1)).isoformat()},
        {"verified_at": (start + timedelta(days=1)).isoformat()},
        {"verified_at": "2026-11-03T00:00:00"},
    ]
    for changes in invalid:
        value = observation()
        value["console"].update(changes)
        assert not module.verified_observation(value, SHA, DEPLOYMENT, start)


def test_missing_or_failed_readiness_check_cannot_pass():
    start = datetime.now(timezone.utc) - timedelta(seconds=1)
    value = observation()
    value["console"]["checks"].pop()
    assert not module.verified_observation(value, SHA, DEPLOYMENT, start)
    value = observation()
    value["console"]["checks"][0]["status"] = "failed"
    assert not module.verified_observation(value, SHA, DEPLOYMENT, start)


class FakeClient:
    def __init__(self):
        self.tag = OLD
        self.calls = []
        self.retain = True
        self.reject_patch = False

    def call(self, method, path, body=None, **kwargs):
        self.calls.append((method, path, body, kwargs))
        if method == "PATCH":
            if self.reject_patch:
                raise module.RequestError(403)
            if self.retain:
                self.tag = body["docker_registry_image_tag"]
            return {"uuid": UUID}
        if method == "POST":
            return {"deployments": [{"resource_uuid": UUID, "deployment_uuid": DEPLOYMENT}]}
        return app(self.tag)


def test_changes_only_tag_then_triggers_with_deploy_credential():
    client = FakeClient()
    with patch.object(module, "wait_for_runtime") as wait:
        result = module.deploy(client, "https://rio.example", UUID, IMAGE, SHA)
    assert result["previous_revision"] == OLD
    assert [call[0] for call in client.calls] == ["GET", "PATCH", "GET", "POST"]
    assert client.calls[1][2] == {"docker_registry_image_tag": SHA, "instant_deploy": False}
    assert client.calls[-1][2] == {"uuid": UUID}
    assert client.calls[-1][3] == {"deploy": True}
    assert wait.call_args.args[5] == DEPLOYMENT


def test_patch_rejection_or_unretained_tag_never_triggers_deploy():
    for reject in [True, False]:
        client = FakeClient()
        client.reject_patch = reject
        client.retain = False
        assert_rejected(lambda: module.deploy(client, "https://rio.example", UUID, IMAGE, SHA))
        assert all(call[0] != "POST" for call in client.calls)


def test_wrong_resource_type_or_image_is_rejected_before_mutation():
    for change in [{"uuid": "wrong"}, {"build_pack": "dockercompose"},
                   {"docker_registry_image_name": "another/image"}]:
        value = app() | change
        assert_rejected(lambda: module.verify_application(value, UUID, IMAGE))


def test_finished_api_job_alone_is_not_enough_and_failed_job_stops():
    class Client:
        state = "finished"

        def call(self, method, path):
            if "/deployments/" in path:
                return {"deployment_uuid": DEPLOYMENT, "status": self.state}
            return app()

    client = Client()
    start = datetime.now(timezone.utc)
    with patch.object(module, "request_json", return_value={"console": {"status": "unknown"}}):
        assert_rejected(lambda: module.wait_for_runtime(
            client, "https://rio.example", UUID, IMAGE, SHA, DEPLOYMENT, start, timeout=0))
    client.state = "failed"
    with patch.object(module, "request_json") as public:
        assert_rejected(lambda: module.wait_for_runtime(
            client, "https://rio.example", UUID, IMAGE, SHA, DEPLOYMENT, start))
        public.assert_not_called()


def test_http_integration_separates_credentials_and_waits_for_current_observation():
    calls = []

    class Handler(BaseHTTPRequestHandler):
        tag = OLD
        polls = 0

        def reply(self, body):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(body).encode())

        def check_api(self, deploy=False):
            expected = "Bearer fake-deploy" if deploy else "Bearer fake-config"
            assert self.headers.get("Authorization") == expected
            assert self.headers.get("CF-Access-Client-Id") == "fake-id"
            assert self.headers.get("CF-Access-Client-Secret") == "fake-secret"
            assert self.headers.get("User-Agent") == "rio-console-deployer/1.0"

        def do_GET(self):
            calls.append(("GET", self.path))
            if self.path == "/api/deployments":
                assert self.headers.get("Authorization") is None
                assert self.headers.get("CF-Access-Client-Secret") is None
                value = observation()
                if self.polls == 1:
                    value["console"]["running_revision"] = OLD
                self.reply(value)
                return
            self.check_api()
            if "/api/v1/deployments/" in self.path:
                type(self).polls += 1
                self.reply({"deployment_uuid": DEPLOYMENT, "status": "finished", "commit": "HEAD"})
            else:
                self.reply(app(self.tag))

        def do_PATCH(self):
            self.check_api()
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            assert body == {"docker_registry_image_tag": SHA, "instant_deploy": False}
            type(self).tag = body["docker_registry_image_tag"]
            self.reply({"uuid": UUID})

        def do_POST(self):
            self.check_api(deploy=True)
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            assert body == {"uuid": UUID}
            self.reply({"deployments": [{"resource_uuid": UUID, "deployment_uuid": DEPLOYMENT}]})

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f"http://127.0.0.1:{server.server_port}"
    client = module.CoolifyClient(origin, "fake-id", "fake-secret", "fake-config", "fake-deploy")
    try:
        result = module.deploy(client, origin, UUID, IMAGE, SHA, timeout=3, interval=0.01)
        assert result["revision"] == SHA
        assert result["previous_revision"] == OLD
        assert Handler.polls == 2
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_redirect_is_not_followed_and_error_body_is_not_reported():
    class Handler(BaseHTTPRequestHandler):
        leaked = False

        def do_GET(self):
            if self.path == "/redirect":
                self.send_response(302)
                self.send_header("Location", "/capture")
            else:
                type(self).leaked = True
                self.send_response(403)
            self.end_headers()
            self.wfile.write(b"fake-secret-value-in-error-body")

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        try:
            module.request_json(f"http://127.0.0.1:{server.server_port}/redirect",
                                headers={"Authorization": "Bearer fake-secret"})
        except module.RequestError as error:
            assert error.status == 302
            assert "fake-secret" not in str(error)
        else:
            raise AssertionError("Redirect must not be followed")
        assert not Handler.leaked
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_production_origins_reject_credentials_paths_and_cleartext():
    assert module.require_origin("https://coolify.example/") == "https://coolify.example"
    for url in ["http://coolify.example", "https://user:password@coolify.example",
                "https://coolify.example/api", "https://coolify.example?token=x"]:
        assert_rejected(lambda: module.require_origin(url))


def test_error_diagnostics_expose_only_allowlisted_metadata():
    error = module.RequestError(403, {
        "Content-Type": "text/html; charset=UTF-8", "cf-mitigated": "challenge",
        "cf-ray": "0123456789abcdef-IAD", "Authorization": "Bearer do-not-log",
        "Location": "https://login.example/?secret=do-not-log",
    })
    assert error.challenge
    assert error.response_type == "text/html"
    assert "0123456789abcdef-IAD" in str(error)
    assert "do-not-log" not in str(error)
    assert "login.example" not in str(error)
    malicious = module.RequestError(403, {"Content-Type": "secret-value", "cf-ray": "secret-value"})
    assert "secret-value" not in str(malicious)


def test_access_diagnostics_are_read_only_and_never_send_deploy_token():
    client = module.CoolifyClient("https://coolify.example", "client", "secret", "config-token", "deploy-token")
    with patch.object(module, "request_json", side_effect=[module.RequestError(401), {}]) as request:
        client.diagnose_read_access()
    assert request.call_count == 2
    first, second = request.call_args_list
    assert first.args == ("https://coolify.example/api/v1/teams/current",)
    assert "Authorization" not in first.kwargs["headers"]
    assert second.kwargs["headers"]["Authorization"] == "Bearer config-token"
    assert all("deploy-token" not in str(call) for call in request.call_args_list)

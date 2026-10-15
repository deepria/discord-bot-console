"""Exercise the host deployment script without Docker or production services."""

import json
import os
from pathlib import Path
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize(
    "scenario,recreate,success",
    [
        ("unchanged", False, True),
        ("outdated", True, True),
        ("missing", True, True),
        ("stopped", True, True),
        ("unhealthy", True, True),
        ("force", True, True),
        ("agent-down", False, False),
        ("build-failure", True, False),
        ("wrong-revision", True, False),
        ("dirty", False, False),
    ],
)
def test_deployment_decision(tmp_path, scenario, recreate, success):
    commands = tmp_path / "bin"
    commands.mkdir()
    # HEAD already equals main in every case, including previous failed deploys.
    git = commands / "git"
    git.write_text(
        '#!/bin/sh\ncase "$1" in\n'
        'rev-parse) echo target;;\n'
        'status) if [ "$SCENARIO" = dirty ]; then echo " M app.py"; fi;;\n'
        'esac\n'
    )
    docker = commands / "docker"
    docker.write_text(
        r'''#!/usr/bin/env python3
import os, sys
from pathlib import Path
args = sys.argv[1:]
s = os.environ['SCENARIO']
marker = Path(os.environ['MARKER'])
with open(os.environ['CALL_LOG'], 'a') as f:
    f.write(' '.join(args) + '\n')
if args[0] == 'inspect':
    if s == 'missing' and not marker.exists():
        sys.exit(1)
    if '.State.Running' in args[2]:
        print('false' if s == 'stopped' and not marker.exists() else 'true')
    else:
        print('old' if s in ('outdated', 'build-failure', 'wrong-revision') and
              (not marker.exists() or s == 'wrong-revision') else 'target')
elif args[0] == 'compose':
    if 'build' in args and s == 'build-failure':
        sys.exit(1)
    if 'up' in args:
        marker.touch()
elif args[0] == 'exec':
    if '/healthz' in args[-1] and s == 'unhealthy' and not marker.exists():
        sys.exit(1)
    if 'RIO_AGENT_URL' in args[-1] and s == 'agent-down':
        sys.exit(1)
'''
    )
    for command in (git, docker):
        command.chmod(0o755)
    record = tmp_path / "status.json"
    log = tmp_path / "calls.log"
    result = subprocess.run(
        ["bash", str(ROOT / "deploy/rio-console-deploy.sh")],
        env={
            **os.environ,
            "PATH": f"{commands}:{os.environ['PATH']}",
            "SCENARIO": scenario,
            "MARKER": str(tmp_path / "recreated"),
            "CALL_LOG": str(log),
            "RIO_CONSOLE_APP_DIR": str(tmp_path),
            "RIO_CONSOLE_STATUS_WRITER": str(ROOT / "scripts/write_deploy_status.py"),
            "RIO_CONSOLE_DEPLOY_STATUS_FILE": str(record),
            "RIO_CONSOLE_READINESS_ATTEMPTS": "1",
            "RIO_CONSOLE_FORCE_DEPLOY": "1" if scenario == "force" else "0",
        },
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert (result.returncode == 0) == success, result.stderr
    calls = log.read_text() if log.exists() else ""
    assert (" build " in calls) == recreate
    assert (" up " in calls) == (recreate and scenario != "build-failure")
    status = json.loads(record.read_text())
    assert status["status"] == ("succeeded" if success else "failed")
    if success:
        assert status["target_revision"] == status["running_revision"] == "target"
        assert status["verified_at"]
        assert {check["name"] for check in status["checks"]} == {
            "container-http", "agent-connectivity"
        }

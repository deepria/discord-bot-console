# Rio Console deployment observations on Coolify

The Console reads `/run/rio-console/deploy-status.json`. The old CT102 timer
produced that file; a Docker Image deployment does not produce it automatically.
Run this observer on the **Coolify deployment VM**, with root access to Docker.
Do not run it inside the Console or mount the Docker socket into the Console.

The observer uses a read-only Coolify token and the application's configured
full-SHA image tag. Docker Image deployment records may contain `commit: HEAD`
and a null image tag, so those fields are not revision evidence. A successful
observation requires a finished latest Coolify deployment, exactly one running
container with the expected image/tag and OCI revision, Docker healthy status,
container-local `/healthz` HTTP 200 and authenticated Agent `/health` HTTP 200.
Failed/cancelled/pending deployments and revision mismatches never attest success.
The `observation` phase indicates current verification, not a reconstructed CI history.

## Install on the deployment VM

Create a Coolify API token with **read only** permission in the application's team.
Save it to a root-only file without printing or committing the value. Record its
expiration and rotate the installed token before it expires.

Copy the observer, service, timer and installer from one reviewed repository
commit into the same directory. Then run as root (use the actual application UUID):

```bash
bash install-rio-console-observer.sh /root/rio-console-migration/coolify-read.token APPLICATION_UUID
```

The installer uses the existing system `python3` and Docker CLI; no pip packages
are required. If Python is absent on Debian, install `python3` before running it.
The token is copied to `/etc/rio-console-monitor/coolify-read.token` with mode 600.
API reads use loopback port 8000 on the VM. The application image is not changed
and no deployment or configuration mutations are made by the observer.

## Attach the status directory

In the application's Coolify **Persistent Storage**, add a bind mount:

| Setting | Value |
| --- | --- |
| Source | `/var/lib/rio-console-monitor/status` |
| Destination | `/run/rio-console` |
| Read only | Enabled |

Mount the **directory**, not the JSON file. Each update replaces the JSON
atomically, so a file bind mount can retain an old inode. Redeploy the application
to attach the mount, then wait for the next observation (about 60 seconds after
the prior observation ends).

```bash
systemctl is-enabled rio-console-observe.timer
systemctl list-timers --all --no-pager rio-console-observe.timer
cat /var/lib/rio-console-monitor/status/deploy-status.json
```

The public state file contains status metadata only. API failures replace the
record with unknown rather than preserving a previous success. If the observer
stops or a write fails, the Console's existing freshness window marks old success
records stale after 900 seconds. Rotate a token by replacing the installed token
with mode 600 and starting `rio-console-observe.service` once.

## Roll back

Disable the observer timer and stop its oneshot service before removing the
mount. Redeploy the application after removing the mount. The Console will show
unknown again; this does not stop the app or Agent. Keep the old CT102 deploy
timer disabled while the Coolify deployment remains in production.

# Rio production deployment from GitHub Actions

The CI workflow validates PRs and main pushes. Only a successful main push
publishes `ghcr.io/deepria/discord-bot-console:<full SHA>` and runs the production
deployment job. The job serializes production deployments and skips an obsolete
commit if main has advanced before the job starts.

## Repository secrets

| Secret | Purpose |
| --- | --- |
| `CF_ACCESS_CLIENT_ID` | Client ID for the API path's Cloudflare Service Auth policy |
| `CF_ACCESS_CLIENT_SECRET` | Matching Cloudflare service-token secret |
| `COOLIFY_CONFIG_TOKEN` | Coolify token with `read` and `write`, in the Rio application's team |
| `COOLIFY_DEPLOY_TOKEN` | Coolify token with `deploy` permission, in the same team |

Record and rotate token expirations. The host observer uses a separate read-only
token; it does not use either Actions token. The workflow contains the public
Coolify/Rio URLs, image repository and application UUID. Update those settings
when moving the deployment to a different application or server.

## Deployment sequence

1. Require the existing validation job and SHA-image publish job to succeed.
2. Read the application and confirm its UUID, Docker Image build type and image
   repository. Record the previous SHA in the job output.
3. PATCH only the image tag, with `instant_deploy: false`, then read it back.
4. POST the deployment request with the deploy token and capture its deployment UUID.
5. Poll that deployment until finished; failures or cancellation fail the job.
6. Require the public Rio `/api/deployments` response to report a new observation
   for that exact deployment UUID and target/running SHA, with all Docker, app and
   Agent checks passed. Verification must have occurred after the deployment request.

Coolify API requests send both Cloudflare headers and the appropriate Bearer
token. Public Rio verification requests send none of those credentials. Redirects
are rejected and error bodies are not logged. Mutation requests are not retried
automatically to avoid duplicate deployment requests. Transient read failures
are retried within the 15-minute verification window.

Requests identify the client as `rio-console-deployer/1.0` rather than Python's
library-default User-Agent. On authentication errors the log includes only the
HTTP status, allowlisted response type, Cloudflare challenge flag and a validated
Ray ID. Read-only `/teams/current` probes distinguish Cloudflare-only access
(expected 401) from Cloudflare plus the config token (expected 200). They never
send the deploy token or print credentials, response bodies or login locations.

The `rio-console-observe.timer` service and read-only status-directory mount must
remain installed. See [COOLIFY-OBSERVER.md](COOLIFY-OBSERVER.md). A successful API
deployment alone is insufficient when the observer is stopped, stale or reporting
another revision. The default observer refresh interval is approximately 60 seconds.

## First live validation

The main push after merging this workflow is the first end-to-end deployment.
Confirm all three jobs succeed: validate, publish-image, deploy-production. Verify
the new SHA on Rio Deploy Watch, ordinary access, Discord login/session, and SSE.
Local HTTP integration tests validate request sequencing and credential separation;
they do not prove that production secrets have the intended permissions.

## Failure and rollback

If tag update fails or does not persist, no deployment is requested. A subsequent
deployment or readiness failure fails the job and leaves the requested tag visible
for diagnosis. The script does not automatically change it back or stop containers.
For a deliberate rollback, take the previous SHA from the job log/summary, set that
image tag in Coolify and redeploy. Confirm Deploy Watch attests that SHA and retest
the app. Preserve previous SHA images in GHCR and consider app-data/schema
compatibility before rolling back. Keep the old CT102 deploy timer disabled.

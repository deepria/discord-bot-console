#!/usr/bin/env bash
set -euo pipefail

# Run on the Coolify/Docker VM as root, never in the Console container.
token_file=${1:?Usage: install-rio-console-observer.sh TOKEN_FILE APPLICATION_UUID}
application_uuid=${2:?Usage: install-rio-console-observer.sh TOKEN_FILE APPLICATION_UUID}
[[ $(id -u) == 0 ]] || { echo 'Run this installer as root.' >&2; exit 1; }
[[ $application_uuid =~ ^[a-zA-Z0-9]{16,64}$ ]] || { echo 'Invalid application UUID.' >&2; exit 1; }
test -s "$token_file"
command -v python3 >/dev/null
command -v docker >/dev/null
command -v systemctl >/dev/null
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

install -d -m 0700 /etc/rio-console-monitor
install -m 0600 "$token_file" /etc/rio-console-monitor/coolify-read.token
printf 'RIO_CONSOLE_APPLICATION_UUID=%s\n' "$application_uuid" > /etc/rio-console-monitor/observer.env
chmod 0600 /etc/rio-console-monitor/observer.env
install -d -m 0755 /usr/local/libexec /var/lib/rio-console-monitor/status
install -m 0755 "$script_dir/rio-console-observe.py" /usr/local/libexec/rio-console-observe.py
install -m 0644 "$script_dir/rio-console-observe.service" /etc/systemd/system/rio-console-observe.service
install -m 0644 "$script_dir/rio-console-observe.timer" /etc/systemd/system/rio-console-observe.timer
systemctl daemon-reload
systemctl start rio-console-observe.service
systemctl enable --now rio-console-observe.timer
echo 'Observer installed. Mount /var/lib/rio-console-monitor/status read-only at /run/rio-console in Coolify.'

#!/usr/bin/env bash
set -euo pipefail
pgrep -af '[.]release-workers/main[.]cjs' || true
pgrep -af '[.]release-workers/processing[.]cjs' || true
clamdscan --ping 1:2 --no-summary /dev/null
task_dir="/run/user/$(id -u)/vtv-document-worker"
if test -d "$task_dir"; then
 ls -l "$task_dir"
 for task_file in "$task_dir"/*.json; do if test -f "$task_file"; then cat "$task_file"; fi; done
fi
task_config="$HOME/.config/vetthevat/local-worker.env"
if test -f "$task_config"; then
 stat -c 'protected-worker-environment: owner=%u mode=%a' "$task_config"
fi

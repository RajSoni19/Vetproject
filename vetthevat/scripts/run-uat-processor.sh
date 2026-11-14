#!/usr/bin/env bash
set -euo pipefail
cd /mnt/d/vetthevat
task_uid=$(id -u)
task_node=$(command -v node)
task_socket="/run/user/${task_uid}/vtv-document-worker/processing.sock"
task_run=${1:-}
[[ $task_run =~ ^[a-f0-9-]{36}$ ]] || exit 1
if test -S "$task_socket"; then
 echo 'Existing private processor detected; refusing to replace it.' >&2
 exit 1
fi
umask 077
printf '%s' "$$" > "/run/user/${task_uid}/vtv-uat-${task_run}.pid"
exec env -i PATH=/usr/bin:/bin HOME=/nonexistent LANG=C.UTF-8 VTV_DOCUMENT_WORKER_PROFILE=local-wsl VTV_DEPLOYMENT_PROFILE=local VTV_LOCAL_WORKER_UID="$task_uid" CLAMAV_SOCKET=/run/clamav/clamd.ctl CLAMAV_INSPECTION_POLICY=vtv-local-bounded-v1 DOCUMENT_PROCESSING_SOCKET="$task_socket" "$task_node" .release-workers/processing.cjs

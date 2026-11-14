#!/usr/bin/env bash
set -euo pipefail
cd /mnt/d/vetthevat
task_uid=$(id -u)
task_node=$(command -v node)
task_socket="/run/user/${task_uid}/vtv-document-worker/processing.sock"
if test -S "$task_socket"; then
 echo 'Existing processor socket present; refusing to replace it.' >&2
 exit 1
fi
env -i PATH=/usr/bin:/bin HOME=/nonexistent LANG=C.UTF-8 VTV_DOCUMENT_WORKER_PROFILE=local-wsl VTV_DEPLOYMENT_PROFILE=local VTV_LOCAL_WORKER_UID="$task_uid" CLAMAV_SOCKET=/run/clamav/clamd.ctl CLAMAV_INSPECTION_POLICY=vtv-local-bounded-v1 DOCUMENT_PROCESSING_SOCKET="$task_socket" "$task_node" .release-workers/processing.cjs > docs/test-results/supplier-processor.log 2>&1 &
task_processor=$!
trap 'kill "$task_processor" 2>/dev/null || true' EXIT
for task_attempt in $(seq 1 50); do
 if test -S "$task_socket"; then break; fi
 sleep 0.1
done
if [[ ${1:-} == --integration ]]; then
 '/mnt/c/Program Files/nodejs/node.exe' tests/sprint-ocr-postgres.cjs "$task_socket"
elif [[ ${1:-} == --full ]]; then
 DOCUMENT_PROCESSING_SOCKET="$task_socket" "$task_node" --experimental-strip-types scripts/local-processing-smoke.cjs
else
 DOCUMENT_PROCESSING_SOCKET="$task_socket" "$task_node" --experimental-strip-types tests/supplier-processing-smoke.cjs
fi

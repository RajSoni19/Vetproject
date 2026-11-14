#!/usr/bin/env bash
set -euo pipefail
cd /mnt/d/vetthevat
exec node --experimental-strip-types scripts/local-worker-bootstrap.cjs "$@"

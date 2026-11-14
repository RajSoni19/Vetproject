#!/usr/bin/env bash
set -euo pipefail
cd /mnt/d/vetthevat
exec node tests/native-processor-call.cjs "$@"

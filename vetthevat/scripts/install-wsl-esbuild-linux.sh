#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
prefix="$HOME/.local/share/vtv-linux-tools"
npm install --prefix "$prefix" --ignore-scripts --no-save --package-lock=false @esbuild/linux-x64@0.28.2

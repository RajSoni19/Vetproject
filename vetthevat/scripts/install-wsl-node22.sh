#!/usr/bin/env bash
set -euo pipefail

version=22.15.1
if [[ "$(uname -m)" != x86_64 ]]; then
  echo "This user-local installer supports Linux x86_64 only." >&2
  exit 1
fi

cache="$HOME/.cache/vtv-node"
prefix="$HOME/.local/lib/nodejs/node-v$version"
mkdir -p "$cache" "$HOME/.local/bin" "$HOME/.local/lib/nodejs"
cd "$cache"
curl -fsSLO "https://nodejs.org/dist/v$version/node-v$version-linux-x64.tar.xz"
curl -fsSLO "https://nodejs.org/dist/v$version/SHASUMS256.txt"
grep -F " node-v$version-linux-x64.tar.xz" SHASUMS256.txt | sha256sum -c -
mkdir -p "$prefix"
tar -xJf "node-v$version-linux-x64.tar.xz" --strip-components=1 -C "$prefix"
ln -sfn "$prefix/bin/node" "$HOME/.local/bin/node"
ln -sfn "$prefix/bin/npm" "$HOME/.local/bin/npm"
ln -sfn "$prefix/bin/npx" "$HOME/.local/bin/npx"
export PATH="$HOME/.local/bin:$PATH"
"$HOME/.local/bin/node" --version
"$HOME/.local/bin/npm" --version

#!/usr/bin/env bash
# FUTURE approved host setup only. Installs side-by-side; never replaces global Node.
set -euo pipefail
archive=${1:?local official tarball required}
sums=${2:?signed SHASUMS256.txt required}
signature=${3:?detached signature required}
keyring=${4:?independently reviewed Node release keyring required}
expected=${5:?independently reviewed tarball SHA-256 required}
[[ ${6:-} == --apply && $EUID -eq 0 && "$expected" =~ ^[a-f0-9]{64}$ ]] || exit 2
# shellcheck source=/dev/null
. /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 && $(uname -m) == x86_64 ]] || exit 2
name=node-v22.23.4-linux-x64
[[ $(basename "$archive") == "$name.tar.xz" ]] || exit 2
base=/opt/vetthevat
[[ ! -e "$base/node" && ! -L "$base/node" && ! -e "$base/$name" && ! -L "$base/$name" && ! -L "$base" ]] || { echo 'Existing runtime path: review upgrade separately';exit 2; }
gpgv --keyring "$keyring" "$signature" "$sums"
signed=$(awk -v name="$name.tar.xz" '$2==name {print $1}' "$sums")
[[ "$signed" == "$expected" && $(sha256sum "$archive" | cut -d' ' -f1) == "$expected" ]] || { echo 'Official signature/hash binding failed';exit 2; }
# Signed upstream archive is trusted only after both checks above; bound its root.
tar -tf "$archive" | python3 -c 'import pathlib,sys;root=sys.argv[1];items=[pathlib.PurePosixPath(x.strip()) for x in sys.stdin];assert items and all(not p.is_absolute() and ".." not in p.parts and p.parts[0]==root for p in items)' "$name"
install -d -o root -g root -m 0755 "$base"
tar --no-same-owner -xf "$archive" -C "$base"
chown -R root:root "$base/$name"
[[ $("$base/$name/bin/node" --version) == v22.23.4 ]] || exit 2
ln -s "$base/$name" "$base/node"
echo 'Reviewed dedicated Node installed. No application/service started.'

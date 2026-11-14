#!/usr/bin/env bash
# PREPARATION ONLY. No apt, nginx reload, DNS changes, database or service start.
set -euo pipefail
profile=${1:-}
[[ "$profile" == staging || "$profile" == production ]] || { echo 'usage: bootstrap-host.sh staging|production --apply'; exit 2; }
[[ ${2:-} == --apply && $EUID -eq 0 ]] || { echo 'Explicit --apply and root are required on an approved host.'; exit 2; }
# shellcheck source=/dev/null
. /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || { echo 'Ubuntu 24.04 required'; exit 2; }
originals="/var/lib/vetthevat-$profile-originals"
[[ ! -e "$originals" && ! -L "$originals" && ! -e "/var/lib/vetthevat-$profile-postgres" && ! -L "/var/lib/vetthevat-$profile-postgres" ]] || { echo 'Existing storage/database paths refused; inspect before bootstrap'; exit 2; }
for role in web mail contact stripe inspect extract processing clamav backup postgres; do
  name="vtv-${role}-${profile}"
  if getent passwd "$name" >/dev/null; then
    [[ $(id -u "$name") -ne 0 && $(id -g "$name") -ne 0 && $(id -gn "$name") == "$name" && $(getent passwd "$name" | cut -d: -f6) == /nonexistent && $(getent passwd "$name" | cut -d: -f7) == /usr/sbin/nologin ]] || { echo 'Existing identity differs; inspect manually'; exit 2; }
  else useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin "$name"; fi
done
for group in "vtv-processing-$profile" "vtv-scan-$profile" "vtv-originals-$profile"; do getent group "$group" >/dev/null || groupadd --system "$group"; done
usermod -a -G "vtv-processing-$profile" "vtv-inspect-$profile"
usermod -a -G "vtv-processing-$profile" "vtv-extract-$profile"
usermod -a -G "vtv-scan-$profile" "vtv-processing-$profile"
for role in web inspect extract backup; do usermod -a -G "vtv-originals-$profile" "vtv-$role-$profile"; done
originals="/var/lib/vetthevat-$profile-originals"
[[ ! -e "$originals" && ! -L "$originals" ]] || { echo 'Existing originals path refused; inspect ownership manually'; exit 2; }
install -d -o "vtv-web-$profile" -g "vtv-originals-$profile" -m 2750 "$originals"
install -d -o "vtv-postgres-$profile" -g "vtv-postgres-$profile" -m 0700 "/var/lib/vetthevat-$profile-postgres"
install -d -o root -g root -m 0755 "/srv/vetthevat/$profile/releases"
install -d -o root -g root -m 0751 "/etc/vetthevat/$profile"
install -d -o root -g root -m 0700 "/etc/vetthevat/$profile/workers" "/etc/vetthevat/$profile/tls"
for role in web mail contact stripe inspect extract; do
  install -d -o "vtv-$role-$profile" -g "vtv-$role-$profile" -m 0700 "/var/lib/vetthevat-$profile-$role"
done
install -d -o "vtv-backup-$profile" -g "vtv-backup-$profile" -m 0700 "/var/lib/vetthevat-$profile-backup"
echo 'Dedicated identities/directories prepared. No service or existing website was changed.'

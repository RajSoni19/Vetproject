#!/usr/bin/env bash
# Dedicated backup credential, NEVER an application/runtime credential.
set -euo pipefail
umask 077
profile=${1:-};[[ "$profile" == staging || "$profile" == production ]] || exit 2
[[ ${VTV_BACKUP_APPROVED:-} == "$profile" && ${PGDATABASE:-} == "vtv_saas_$profile" && ${PGSSLMODE:-} == verify-full && -f ${PGSSLROOTCERT:-/nonexistent} && ${PGUSER:-} == vtv_backup_operator && ${PGHOST:-} == "${VTV_APPROVED_DATABASE_HOST:-}" && ${PGPORT:-} == "${VTV_APPROVED_DATABASE_PORT:-}" ]] || { echo 'Exact approved backup configuration required';exit 2; }
case ${VTV_DATABASE_PROVIDER:-} in
  serververse)
    [[ "$profile" == production && "$PGHOST" == 127.0.0.1 && "$PGPORT" =~ ^[0-9]+$ && "$PGPORT" -ge 1024 && "$PGPORT" -le 65535 && "$PGPORT" != 55439 && "$PGPORT" != 55440 && ${SAAS_INSTALLATION_ID:-} =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$ && ${VTV_SERVERVERSE_DATABASE_APPROVED:-} == "production:${SAAS_INSTALLATION_ID}:${PGPORT}" ]] || exit 2
    ;;
  neon)
    [[ "$PGHOST" == *.* && "$PGHOST" != *localhost* && "$PGHOST" != 127.* && "$PGHOST" != ::1 && "$PGPORT" == 5432 ]] || exit 2
    ;;
  *) exit 2 ;;
esac
base="/var/lib/vetthevat-$profile-backup";[[ -d "$base" && ! -L "$base" ]] || exit 2
exec 9>"$base/backup.lock";flock -n 9 || exit 2
id=$(date -u +%Y%m%dT%H%M%SZ);dir="$base/$id";mkdir -m 0700 "$dir"
# pg_dump fails rather than silently emitting an RLS-filtered partial archive.
pg_dump --format=custom --no-password --file="$dir/database.dump" 2>"$dir/private-pg-dump.err"
pg_restore --list "$dir/database.dump" >"$dir/archive-list.txt" 2>"$dir/private-pg-restore.err"
members=(database.dump archive-list.txt)
if [[ ${VTV_PRIVATE_ORIGINALS_ENABLED:-0} == 1 ]]; then
 [[ "$profile" == production && ${VTV_PRIVATE_ORIGINALS_DIR:-} == /var/lib/vetthevat-production-originals && ${VTV_PRIVATE_ORIGINALS_APPROVED:-} == "production:${SAAS_INSTALLATION_ID:-}" && -d "$VTV_PRIVATE_ORIGINALS_DIR" && ! -L "$VTV_PRIVATE_ORIGINALS_DIR" ]] || exit 2
 # DB snapshot precedes immutable file inventory: every committed DB reference
 # already has its atomically published bytes. Extra newer objects are harmless.
 python3 "$(dirname "$0")/private-files.py" create "$VTV_PRIVATE_ORIGINALS_DIR" "$dir/originals.tar" >"$dir/files-verification.json"
 members+=(originals.tar files-verification.json)
else
 [[ ${VTV_EXTERNAL_ORIGINALS_BACKUP_ATTESTATION:-} =~ ^[a-f0-9]{64}$ ]] || { echo 'Independent external original-file recovery evidence required'; exit 2; }
fi
(cd "$dir" && sha256sum "${members[@]}" >checksums.txt && sha256sum --check --status checksums.txt)
# Encryption MUST precede off-host upload. Identity exists only on recovery host.
[[ -n ${VTV_BACKUP_AGE_RECIPIENT:-} && -n ${VTV_BACKUP_REMOTE:-} && "$VTV_BACKUP_REMOTE" == "vtv-$profile-backup:"* ]] || { echo 'Off-host encryption/remote config missing; private dump retained for inspection';exit 2; }
tar -C "$dir" -cf - "${members[@]}" checksums.txt | age -r "$VTV_BACKUP_AGE_RECIPIENT" >"$dir/archive.tar.age"
(cd "$dir" && sha256sum archive.tar.age >encrypted.sha256)
rclone copyto "$dir/archive.tar.age" "$VTV_BACKUP_REMOTE/$id/archive.tar.age" --config "/etc/vetthevat/$profile/backup-rclone.conf" --quiet
rclone copyto "$dir/encrypted.sha256" "$VTV_BACKUP_REMOTE/$id/encrypted.sha256" --config "/etc/vetthevat/$profile/backup-rclone.conf" --quiet
rclone check "$dir" "$VTV_BACKUP_REMOTE/$id" --include archive.tar.age --include encrypted.sha256 --one-way --download --config "/etc/vetthevat/$profile/backup-rclone.conf" --quiet
printf '{"backup":"%s","at":"%s","offHostVerified":true,"originalsIncluded":%s,"restoreTested":false}\n' "$id" "$(date -u +%FT%TZ)" "$([[ ${VTV_PRIVATE_ORIGINALS_ENABLED:-0} == 1 ]] && echo true || echo false)" >"$base/.latest.json.tmp"
mv -f "$base/.latest.json.tmp" "$base/latest.json"
echo 'Encrypted off-host backup verified. Plaintext private dump retained under 0700 until approved retention cleanup.'

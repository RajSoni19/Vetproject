#!/usr/bin/env bash
# NEW DISPOSABLE TARGET ONLY; provider DBA must approve exact target/hash first.
set -euo pipefail
umask 077
profile=${1:-};archive=${2:-};expected=${3:-}
[[ "$profile" == staging || "$profile" == production ]] || exit 2
[[ ${4:-} == --apply && "$expected" =~ ^[a-f0-9]{64}$ && ${VTV_RESTORE_APPROVED_TARGET:-} == "${PGHOST:-}/${PGDATABASE:-}" ]] || { echo 'Exact fresh-target approval required';exit 2; }
[[ ${PGDATABASE:-} =~ ^vtv_restore_drill_[a-z0-9_]+$ && ${PGSSLMODE:-} == verify-full && -f ${PGSSLROOTCERT:-/nonexistent} && ${PGUSER:-} == vtv_restore_operator && ${PGHOST:-} == "${VTV_APPROVED_DATABASE_HOST:-}" && ${PGPORT:-} == "${VTV_APPROVED_DATABASE_PORT:-}" ]] || exit 2
case ${VTV_DATABASE_PROVIDER:-} in
  serververse)
    [[ "$profile" == production && "$PGHOST" == 127.0.0.1 && "$PGPORT" =~ ^[0-9]+$ && "$PGPORT" -ge 1024 && "$PGPORT" -le 65535 && "$PGPORT" != 55439 && "$PGPORT" != 55440 && ${SAAS_INSTALLATION_ID:-} =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$ && ${VTV_SERVERVERSE_DATABASE_APPROVED:-} == "production:${SAAS_INSTALLATION_ID}:${PGPORT}" ]] || exit 2
    ;;
  neon)
    [[ "$PGHOST" == *.* && "$PGHOST" != 127.* && "$PGHOST" != *localhost* && "$PGPORT" == 5432 ]] || exit 2
    ;;
  *) exit 2 ;;
esac
actual=$(sha256sum "$archive" | cut -d' ' -f1);[[ "$actual" == "$expected" ]] || exit 2
[[ $(psql -X --no-password -Atc "SELECT count(*) FROM pg_namespace WHERE nspname NOT IN('public','information_schema') AND nspname !~ '^pg_'") == 0 ]] || { echo 'Nonempty restore database refused';exit 2; }
[[ $(psql -X --no-password -Atc "SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN('r','v','m','S','f')") == 0 ]] || exit 2
# Roles must be pre-provisioned by the approved managed DBA plan. Preserve grants
# and owners; never use --no-owner or --no-acl merely to hide restore errors.
pg_restore --exit-on-error --single-transaction --no-password --dbname="$PGDATABASE" "$archive"
psql -X --no-password --set=ON_ERROR_STOP=1 -Atc "SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('saas','business','operations') AND c.relkind='r' ORDER BY 1,2"
echo 'Archive restored into the separately approved disposable target. RLS/data/object/recovery acceptance still required; no app or worker was repointed.'

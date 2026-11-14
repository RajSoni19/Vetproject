#!/usr/bin/env bash
# FUTURE OPERATOR ACTION ONLY. Never run during package preparation.
set -euo pipefail
profile=${1:-}; id=${2:-}; archive=${3:-}; sha=${4:-}; node_role=${6:-}
[[ "$profile" == staging || "$profile" == production ]] || exit 2
[[ "$node_role" == web || "$node_role" == workers || "$node_role" == all ]] || { echo "Node role web|workers|all required as argument 6";exit 2; }
[[ "$id" =~ ^[a-z0-9][a-z0-9.-]{6,79}$ && $id != *..* && "$sha" =~ ^[a-f0-9]{64}$ && ${5:-} == --apply && $EUID -eq 0 ]] || { echo 'Explicit version/hash/--apply/root required'; exit 2; }
base="/srv/vetthevat/$profile"; candidate="$base/releases/$id"
[[ -d "$base/releases" && ! -L "$base" && ! -L "$base/releases" && ! -e "$candidate" && ! -L "$candidate" ]] || exit 2
exec 9>"$base/release.lock"; flock -n 9 || { echo 'Another release operation is active'; exit 2; }
# Approval record is a human-reviewed acceptance attestation, not a test result.
python3 - "$profile" "$sha" <<'PY'
import json,os,stat,sys
profile,sha=sys.argv[1:];file=f'/etc/vetthevat/{profile}/acceptance.json';s=os.lstat(file)
if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or stat.S_IMODE(s.st_mode)!=0o600: raise SystemExit('Root-owned 0600 acceptance record required')
a=json.load(open(file)); gates=['linux','nonroot','nginx','rls','privateStorage','processing','stripeTest','smtp','restore','workerRecovery','functionalRelease']
if a.get('profile')!=profile or a.get('releaseSha256')!=sha or any(a.get(g) is not True for g in gates): raise SystemExit('Acceptance incomplete; release blocked')
if profile=='production' and a.get('productionApproval') is not True: raise SystemExit('Separate production approval required')
PY
python3 "$(dirname "$0")/verify-archive.py" "$archive" "$candidate" "$sha"
chown -R root:root "$candidate"
/opt/vetthevat/node/bin/node "$candidate/deploy/ubuntu/verify-runtime.cjs" "$candidate"
if [[ "$node_role" == web || "$node_role" == all ]];then
  [[ ! -e "$candidate/app/.next/cache" && ! -L "$candidate/app/.next/cache" ]] || exit 2
  install -d -o "vtv-web-$profile" -g "vtv-web-$profile" -m 0700 "/var/lib/vetthevat-$profile-web/cache/$id"
  ln -s "/var/lib/vetthevat-$profile-web/cache/$id" "$candidate/app/.next/cache"
fi
previous=''; if [[ -L "$base/current" ]]; then previous=$(readlink -f "$base/current"); [[ "$previous" == "$base/releases/"* && -d "$previous/app" ]] || exit 2; elif [[ -e "$base/current" ]]; then echo 'Refusing non-symlink current path'; exit 2; fi
activate() { ln -s "$1" "$base/.current-new"; mv -Tf "$base/.current-new" "$base/current"; }
restart() {
 if [[ "$node_role" == workers || "$node_role" == all ]];then
  for kind in mail contact stripe inspect extract;do systemctl stop "vetthevat-$kind-$profile.service" || return 1;done
  systemctl restart "vetthevat-processing@$profile.service" || return 1
 fi
 if [[ "$node_role" == web || "$node_role" == all ]];then systemctl restart "vetthevat-web@$profile.service" || return 1;fi
 if [[ "$node_role" == workers || "$node_role" == all ]];then
  for kind in mail contact stripe inspect extract;do systemctl restart "vetthevat-$kind-$profile.service" || return 1;done
 fi
}
smoke() {
 local target=$1 release_id
 if [[ "$node_role" == web || "$node_role" == all ]];then /opt/vetthevat/node/bin/node --env-file="/etc/vetthevat/$profile/web.env" "$target/deploy/ubuntu/smoke.cjs" || return 1;fi
 if [[ "$node_role" == workers || "$node_role" == all ]];then
  release_id=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["id"])' "$target/release.json") || return 1
  /opt/vetthevat/node/bin/node "$target/deploy/ubuntu/worker-smoke.cjs" "$profile" "$release_id"
 fi
}
if [[ -e "$base/.current-new" || -L "$base/.current-new" || -e "$base/.previous-new" || -L "$base/.previous-new" ]]; then echo 'Stale release pointer; inspect manually'; exit 2; fi
activate "$candidate"
if restart && smoke "$candidate"; then
  if [[ -n "$previous" ]]; then ln -s "$previous" "$base/.previous-new"; mv -Tf "$base/.previous-new" "$base/previous"; fi
  echo 'Release health passed. No database migration or nginx change performed.'
else
  if [[ -n "$previous" ]]; then activate "$previous"; if restart && smoke "$previous";then echo 'Previous release restored and health checked. Database unchanged.';else echo 'Rollback health failed; operator intervention required.';fi; else
   echo 'First release failed; stop this node role and inspect.'
   if [[ "$node_role" == web || "$node_role" == all ]];then systemctl stop "vetthevat-web@$profile.service";fi
   if [[ "$node_role" == workers || "$node_role" == all ]];then for kind in mail contact stripe inspect extract;do systemctl stop "vetthevat-$kind-$profile.service";done;systemctl stop "vetthevat-processing@$profile.service";fi
  fi
  exit 1
fi

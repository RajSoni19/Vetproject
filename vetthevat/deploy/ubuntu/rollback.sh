#!/usr/bin/env bash
set -euo pipefail
profile=${1:-};node_role=${3:-}
[[ "$profile" == staging || "$profile" == production ]] || exit 2
[[ "$node_role" == web || "$node_role" == workers || "$node_role" == all ]] || exit 2
[[ ${2:-} == --apply && $EUID -eq 0 ]] || { echo 'Explicit --apply/root required'; exit 2; }
base="/srv/vetthevat/$profile";exec 9>"$base/release.lock";flock -n 9 || exit 2
[[ -L "$base/previous" && -L "$base/current" && ! -e "$base/.rollback-new" && ! -L "$base/.rollback-new" ]] || exit 2
previous=$(readlink -f "$base/previous");[[ "$previous" == "$base/releases/"* && -d "$previous/app" ]] || exit 2
/opt/vetthevat/node/bin/node "$previous/deploy/ubuntu/verify-runtime.cjs" "$previous"
ln -s "$previous" "$base/.rollback-new";mv -Tf "$base/.rollback-new" "$base/current"
if [[ "$node_role" == workers || "$node_role" == all ]];then
 for kind in mail contact stripe inspect extract;do systemctl stop "vetthevat-$kind-$profile.service";done
 systemctl restart "vetthevat-processing@$profile.service"
fi
if [[ "$node_role" == web || "$node_role" == all ]];then
 systemctl restart "vetthevat-web@$profile.service"
 /opt/vetthevat/node/bin/node --env-file="/etc/vetthevat/$profile/web.env" "$previous/deploy/ubuntu/smoke.cjs"
fi
if [[ "$node_role" == workers || "$node_role" == all ]];then
 for kind in mail contact stripe inspect extract;do systemctl restart "vetthevat-$kind-$profile.service";done
 id=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["id"])' "$previous/release.json")
 /opt/vetthevat/node/bin/node "$previous/deploy/ubuntu/worker-smoke.cjs" "$profile" "$id"
fi
echo 'Application/worker rollback completed; database and storage were not rolled back.'

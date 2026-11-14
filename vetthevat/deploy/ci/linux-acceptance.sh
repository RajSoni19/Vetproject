#!/usr/bin/env bash
# Only on a disposable Ubuntu runner. NEVER run on the existing VPS.
set -euo pipefail
[[ ${VTV_DISPOSABLE_ACCEPTANCE:-} == YES && ${GITHUB_ACTIONS:-} == true ]] || { echo 'Disposable CI runner required';exit 2; }
root=$(pwd); id=${1:?release ID required};app="$root/dist/$id/app"
[[ $EUID -ne 0 && -f "$app/server.js" && -f "$app/workers/main.cjs" ]] || { echo 'Non-root CI identity and compiled artifact required';exit 2; }
for f in deploy/ubuntu/*.sh;do bash -n "$f";shellcheck "$f";done
python3 -m py_compile deploy/ubuntu/verify-archive.py
# Standalone Next server really starts under the runner's non-root identity.
export NODE_ENV=production WEB_AUTH_ENABLED=0 SAAS_BACKEND_ENABLED=0 CONTACT_ENABLED=0 LEADS_ENABLED=0
export PORT=3100 HOSTNAME=127.0.0.1
(cd "$app" && exec node server.js >"$root/.deployment-review/linux-web.log" 2>&1) & web=$!
nginx_pid=''
cleanup(){ if [[ -n "$nginx_pid" ]];then kill "$nginx_pid" 2>/dev/null || true;fi;kill "$web" 2>/dev/null || true; }
trap cleanup EXIT
for i in $(seq 1 30);do if curl --fail --silent http://127.0.0.1:3100/api/health/live >/dev/null;then break;fi;sleep 1;done
curl --fail --silent http://127.0.0.1:3100/api/health/live | python3 -c 'import json,sys;assert json.load(sys.stdin)["live"] is True'
[[ $(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3100/api/health/ready) == 401 ]]
tmp=$(mktemp -d)
# Use the actual rendered production-shaped vhost with disposable local CA/mTLS.
# Cloudflare itself is not contacted or accepted by this fixture.
python3 deploy/ci/nginx-fixture.py .deployment-review/staging "$tmp"
nginx -t -p "$tmp/" -c "$tmp/nginx.conf"
nginx -p "$tmp/" -c "$tmp/nginx.conf" -g 'daemon off;' & nginx_pid=$!
url=https://staging.vetthevat.com:8449
transport=(--silent --show-error --noproxy '*' --resolve staging.vetthevat.com:8449:127.0.0.1 --cacert "$tmp/ca.crt")
client=(--cert "$tmp/client.crt" --key "$tmp/client.key")
for i in $(seq 1 10);do if curl "${transport[@]}" "${client[@]}" --fail "$url/api/health/live" >/dev/null;then break;fi;sleep 1;done
curl "${transport[@]}" "${client[@]}" --fail "$url/api/health/live" | python3 -c 'import json,sys;assert json.load(sys.stdin)["live"] is True'
[[ $(curl "${transport[@]}" --output /dev/null --write-out '%{http_code}' "$url/api/health/live") == 400 ]]
[[ $(curl "${transport[@]}" "${client[@]}" --output /dev/null --write-out '%{http_code}' "$url/api/internal/auth-notifications") == 404 ]]
[[ $(curl "${transport[@]}" "${client[@]}" --output /dev/null --write-out '%{http_code}' "$url/api/health/ready") == 404 ]]
node --check "$app/workers/main.cjs"
node --check "$app/workers/processing.cjs"
# Load both bundles and native modules from the artifact's own dependency tree.
(cd "$app" && node -e 'require("./workers/main.cjs");require("./workers/processing.cjs");require("@node-rs/argon2");')
node deploy/ubuntu/verify-runtime.cjs "dist/$id"
# A worker lacking approved database/identity config must exit rather than pretend healthy.
if node "$app/workers/main.cjs" mail >"$root/.deployment-review/linux-worker-refusal.log" 2>&1;then echo 'Unconfigured worker incorrectly started';exit 1;fi
python3 deploy/ubuntu/verify-archive.py "dist/$id.tar.gz" "$root/.deployment-review/extracted-release" "$(cut -d' ' -f1 "dist/$id.tar.gz.sha256")"
printf '{"nonRootWeb":true,"renderedNginxTlsRouting":true,"missingClientCertificateDenied":true,"healthFailClosed":true,"unconfiguredWorkerRefused":true,"archiveVerified":true,"managedDatabase":false,"realProcessing":false,"cloudflare":false,"deployed":false}\n' >.deployment-review/linux-acceptance.json

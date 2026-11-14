#!/usr/bin/env bash
# Ephemeral GitHub-hosted Ubuntu VM ONLY. Never invoke against a user's VPS.
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true && ${VTV_DISPOSABLE_ACCEPTANCE:-} == YES && $EUID -ne 0 && $(uname -m) == x86_64 ]] || exit 2
id=${1:?exact local release required};root=$(pwd);candidate="$root/dist/$id"
[[ "$id" =~ ^ci-[a-f0-9]{12}$ && -f "$candidate/release.json" ]] || exit 2
# The standard hosted runner has an actual systemd init, unlike a Docker job.
[[ $(ps -p 1 -o comm=) == systemd ]] || { echo 'Real systemd runner required';exit 2; }
[[ ! -e /srv/vetthevat && ! -e /etc/vetthevat && ! -e /opt/vetthevat ]] || { echo 'Disposable pristine VTV paths required';exit 2; }
sudo bash deploy/ubuntu/bootstrap-host.sh staging --apply
sudo install -d -m 0755 /opt/vetthevat
sudo ln -s "$(dirname "$(dirname "$(command -v node)")")" /opt/vetthevat/node
sudo cp -a "$candidate" "/srv/vetthevat/staging/releases/$id"
sudo chown -R root:root "/srv/vetthevat/staging/releases/$id"
sudo ln -s "/srv/vetthevat/staging/releases/$id" /srv/vetthevat/staging/current
sudo install -d -o vtv-web-staging -g vtv-web-staging -m 0700 "/var/lib/vetthevat-staging-web/cache/$id"
sudo ln -s "/var/lib/vetthevat-staging-web/cache/$id" "/srv/vetthevat/staging/releases/$id/app/.next/cache"
printf 'NODE_ENV=production\nHOSTNAME=127.0.0.1\nPORT=3111\nWEB_AUTH_ENABLED=0\nSAAS_BACKEND_ENABLED=0\nCONTACT_ENABLED=0\nLEADS_ENABLED=0\nSMTP_ENABLED=0\nR2_ENABLED=0\nSTRIPE_TEST_ENABLED=0\n' >.deployment-review/systemd-web.env
sudo install -m 0600 .deployment-review/systemd-web.env /etc/vetthevat/staging/web.env
sudo install -m 0600 deploy/environments/staging/processing.env.template /etc/vetthevat/staging/processing.env
sudo install -m 0644 .deployment-review/staging/clamd.conf /etc/vetthevat/staging/clamd.conf
sudo install -d -m 0755 /etc/vetthevat/processing-policy
sudo install -m 0644 deploy/processing/policy.xml /etc/vetthevat/processing-policy/policy.xml
for unit in web processing clamav;do sudo install -m 0644 "deploy/systemd/vetthevat-$unit@.service" "/etc/systemd/system/vetthevat-$unit@.service";done
sudo systemctl daemon-reload
cleanup(){ sudo systemctl stop vetthevat-web@staging.service vetthevat-processing@staging.service vetthevat-clamav@staging.service || true; }
trap cleanup EXIT
sudo systemd-analyze verify --man=no vetthevat-web@staging.service vetthevat-processing@staging.service vetthevat-clamav@staging.service
# Refresh actual signatures. A network/rate-limit/signature failure fails this gate.
sudo systemctl stop clamav-freshclam.service clamav-daemon.service clamav-daemon.socket || true
sudo freshclam --stdout >.deployment-review/private-freshclam.log 2>&1
sudo systemctl start vetthevat-web@staging.service vetthevat-processing@staging.service
for attempt in $(seq 1 60);do if curl --silent --fail http://127.0.0.1:3111/api/health/live >/dev/null && sudo test -S /run/vetthevat-staging/processing.sock;then break;fi;sleep 1;done
curl --silent --fail http://127.0.0.1:3111/api/health/live >/dev/null
for role in web processing clamav;do
 pid=$(sudo systemctl show "vetthevat-$role@staging.service" --property MainPID --value)
 [[ "$pid" -gt 1 && $(ps -o user= -p "$pid" | xargs) == "vtv-$role-staging" ]] || exit 1
done
if sudo -u vtv-web-staging curl --silent --fail --unix-socket /run/vetthevat-staging/processing.sock http://localhost/live >/dev/null;then echo 'Web identity unexpectedly reached processing socket';exit 1;fi
# Only the permitted inspect identity can use the real processing socket.
sudo -u vtv-inspect-staging env VTV_DISPOSABLE_ACCEPTANCE=YES NODE_PATH="/srv/vetthevat/staging/releases/$id/app/node_modules" /opt/vetthevat/node/bin/node "/srv/vetthevat/staging/releases/$id/deploy/ci/processing-acceptance.cjs" >.deployment-review/native-processing.json
printf '{"dedicatedNonRootWeb":true,"independentProcessingWorker":true,"realSystemd":true,"webDeniedProcessingSocket":true,"managedDatabase":false,"deployment":false}\n' >.deployment-review/systemd-acceptance.json

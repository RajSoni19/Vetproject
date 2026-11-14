# ServerVerse access and protected-host audit

These are owner instructions for a later approved operation. No SSH has been attempted. Do not execute account provisioning, package installation, SSH changes, DNS changes or service operations until the owner separately approves them. Inovetaa and every existing website/service are excluded.

## Identify the actual VPS and host key without SSH

1. Sign in to the existing ServerVerse customer panel through its bookmarked/provider-verified address. Select the VPS by subscription/server ID, not by the Cloudflare DNS address. Record its public IPv4/IPv6, operating system, SSH port and provider console identity. Cloudflare-proxied DNS does not identify the origin IP.
2. Open the provider's authenticated browser/serial console yourself. Run these read-only commands there:

   ```sh
   hostnamectl
   ip -brief address
   ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
   cat /etc/ssh/ssh_host_ed25519_key.pub
   ```

   Share the public host key and SHA256 fingerprint through the existing authenticated owner channel. They are public keys; never share `/etc/ssh/ssh_host_ed25519_key`, login passwords or private audit keys. A console/OS discrepancy is a stop condition.
3. Confirm the SSH port from the provider settings or owner console's listener inventory. Do not change the existing SSH configuration. A key collected with `ssh-keyscan` is only an untrusted candidate; its SHA256 fingerprint must match the console's public key through that independent channel. Never use `StrictHostKeyChecking=no` or accept a changed key on trust.
4. Create a task-specific `known_hosts` file locally from the independently verified public key: `host ssh-ed25519 <public-key>` for port 22 or `[host]:port ssh-ed25519 <public-key>` for a custom port. Confirm it with `ssh-keygen -lf <task-known-hosts-file> -E sha256` before authorizing any connection. Keep unrelated known-host entries unchanged.

## Least-privilege audit account — future owner action only

An unprivileged forced-command SSH key is preferred. This account needs no sudo, Docker, database, PM2, journal, app-user, TLS-key or environment-file access. Inventory it cannot read must be reported unavailable, then collected separately by the owner through the console.

After separate approval, the owner can create a **new, unused** account such as `vtv-audit` with its own group, a locked password, `/bin/sh` as its shell and a dedicated home. `/usr/sbin/nologin` prevents SSH forced-command execution and must not be used for this one audit account; application/worker users still use nologin. Verify the name/path are not already used by Inovetaa or another service. Install the reviewed audit script and wrapper into new root-owned, non-writable paths; never overwrite an existing file.

Root-owned wrapper `/usr/local/libexec/vtv-audit-readonly`:

```sh
#!/bin/sh
exec /usr/bin/bash /usr/local/libexec/vtv-audit/audit-host-readonly.sh vetthevat.com
```

The one public audit key's `authorized_keys` entry must be restricted, replacing the placeholders with the approved client IP/key:

```text
from="<approved-audit-client-ip>/32",restrict,command="/usr/local/libexec/vtv-audit-readonly" ssh-ed25519 <audit-public-key> vtv-readonly-audit
```

Use a private home, `.ssh` mode 0700 and `authorized_keys` mode 0600, owned by the audit account. Confirm the account has no other usable keys or password and no privileged supplementary groups. `restrict` disables port/X11/agent forwarding, PTY and user rc; the root-owned forced command ignores `SSH_ORIGINAL_COMMAND`, so a request for a shell, SFTP or another command still runs only the inventory. Do not modify global `sshd_config` or restart SSH for this preparation. The owner must validate effective account policy before handing over access.

The following is an **unexecuted provisioning recipe for the owner after approval**, not a current instruction to change the VPS. It assumes the reviewed script, wrapper and single restricted public-key entry have been placed in a private staging directory by the owner. The refusal checks must all pass before creating anything:

```sh
getent passwd vtv-audit && exit 1
getent group vtv-audit && exit 1
test ! -e /var/lib/vtv-audit && test ! -L /var/lib/vtv-audit || exit 1
test ! -e /usr/local/libexec/vtv-audit && test ! -L /usr/local/libexec/vtv-audit || exit 1
test ! -e /usr/local/libexec/vtv-audit-readonly && test ! -L /usr/local/libexec/vtv-audit-readonly || exit 1
useradd --create-home --user-group --home-dir /var/lib/vtv-audit --shell /bin/sh vtv-audit
passwd -l vtv-audit
chmod 0700 /var/lib/vtv-audit
install -d -o root -g root -m 0755 /usr/local/libexec/vtv-audit
install -o root -g root -m 0755 <reviewed-audit-script> /usr/local/libexec/vtv-audit/audit-host-readonly.sh
install -o root -g root -m 0755 <reviewed-forced-command-wrapper> /usr/local/libexec/vtv-audit-readonly
install -d -o vtv-audit -g vtv-audit -m 0700 /var/lib/vtv-audit/.ssh
install -o vtv-audit -g vtv-audit -m 0600 <single-restricted-public-key-entry-file> /var/lib/vtv-audit/.ssh/authorized_keys
id vtv-audit
```

Do not add sudo/group membership, another key or an unrestricted shell login to make a failed probe pass. If current PAM/SSH policy denies the locked account, stop and have the owner review the policy; do not edit shared SSH settings or restart the daemon automatically.

If this account cannot be safely provisioned without touching the existing host setup, do not create it: the owner can run `bash audit-host-readonly.sh vetthevat.com` in the provider console and share sanitized output instead.

## Exact later read-only command

Only after explicit access authorization and fingerprint verification:

```sh
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile=<verified-task-known-hosts-file> \
  -o IdentitiesOnly=yes -i <private-audit-key-path> -p <verified-port> \
  vtv-audit@<verified-vps-ip>
```

For an already authorized owner-managed read-only shell instead of the forced-command account:

```sh
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile=<verified-task-known-hosts-file> \
  -o IdentitiesOnly=yes -i <private-audit-key-path> -p <verified-port> \
  <approved-user>@<verified-vps-ip> 'bash -s -- vetthevat.com' \
  < deploy/ubuntu/audit-host-readonly.sh
```

No connection was attempted during local preparation. Supply credentials through private files, never chat. Preserve the sanitized audit plus existing-site baselines privately. Do not publish origin addresses, private process metadata or unrelated customer details.

## Required audit decisions

Record OS/architecture, VTV-exclusive spare RAM/CPU/disk under representative existing load, every occupied port, current Nginx/default vhosts, process manager, TLS topology, signature updater, PostgreSQL clusters/major versions, backup destination and monitoring owner. `audit-host-readonly.sh` deliberately avoids `nginx -T`, environment reads, private keys, PM2 commands that could start a daemon, and database queries.

Complete `deploy/postgres/serververse/host-audit.json.template` with verified sanitized measurements, then run `node scripts/deployment/serververse-capacity.cjs <audit.json>` locally. Defaults fail closed. Proposed application port 3200 and PostgreSQL port are **not** approved until independently shown unused. The current caps require 14,464 MiB of VTV-only memory headroom, four available vCPUs and at least 30 GiB free disk before volume-growth budgeting. A smaller VPS needs measured/reviewed limits or a capacity upgrade; never disable ClamAV to fit.

No production GO decision follows from completing inventory alone. Exact VTV-only diffs and release evidence must be approved before installation, account/database creation, Nginx reload, service start/restart, migration, DNS or public enablement.

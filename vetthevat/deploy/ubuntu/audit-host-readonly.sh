#!/usr/bin/env bash
# Read-only inventory for an approved shared Ubuntu VPS. Never prints env files.
set -uo pipefail

domain=${1:-vetthevat.com}
if [[ ! "$domain" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?\.[A-Za-z]{2,}$ ]]; then
  echo "A DNS hostname is required." >&2
  exit 2
fi

section() { printf '\n## %s\n' "$1"; }

section "Operating system"
if [[ -r /etc/os-release ]]; then
  awk -F= '/^(NAME|ID|VERSION_ID|PRETTY_NAME)=/ { print }' /etc/os-release
else
  echo "OS release metadata unavailable."
fi
uname -srmo 2>/dev/null || true

section "CPU, memory, disk"
if command -v nproc >/dev/null 2>&1; then nproc; else echo "CPU count unavailable."; fi
if command -v free >/dev/null 2>&1; then free -h; else echo "Memory inventory unavailable."; fi
paths=()
for path in / /srv /opt /var/lib; do [[ -e "$path" ]] && paths+=("$path"); done
df -hT "${paths[@]}" 2>/dev/null || echo "Disk inventory unavailable."

section "Node.js and package managers"
for tool in node npm; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf '%s: ' "$tool"
    "$tool" --version 2>/dev/null || echo "version unavailable"
  else
    printf '%s: not installed\n' "$tool"
  fi
done
for tool in pnpm yarn; do
  if command -v "$tool" >/dev/null 2>&1; then
    tool_path=$(command -v "$tool")
    resolved_path=$(readlink -f "$tool_path" 2>/dev/null || printf '%s' "$tool_path")
    if [[ "$resolved_path" == *corepack* ]]; then
      printf '%s: Corepack shim present; version not queried\n' "$tool"
    else
      printf '%s: ' "$tool"
      "$tool" --version 2>/dev/null || echo "version unavailable"
    fi
  else
    printf '%s: not installed\n' "$tool"
  fi
done
if command -v pm2 >/dev/null 2>&1; then
  echo "PM2 CLI installed; its process list was not queried to avoid starting a missing PM2 daemon."
else
  echo "PM2 CLI: not installed."
fi

section "Running system services"
if command -v systemctl >/dev/null 2>&1; then
  systemctl list-units --type=service --state=running --no-legend --no-pager 2>/dev/null |
    awk '{ print $1, $3 }' || echo "Systemd service inventory unavailable."
else
  echo "Systemd unavailable."
fi

section "Listening TCP ports"
if command -v ss >/dev/null 2>&1; then
  ss -H -ltnp 2>/dev/null | awk '{ print $4, $NF }' || echo "Socket inventory unavailable."
else
  echo "ss is not installed."
fi

section "Nginx and configured virtual hosts"
if command -v nginx >/dev/null 2>&1; then
  nginx -v 2>&1
  if command -v systemctl >/dev/null 2>&1; then systemctl is-active nginx 2>/dev/null || true; fi
  for file in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [[ -f "$file" && -r "$file" ]] || continue
    while IFS= read -r line; do
      directive=${line%%#*}
      directive="${directive#"${directive%%[![:space:]]*}"}"
      if [[ "$directive" =~ ^(server_name|listen)[[:space:]] ]]; then
        printf '%s: %s\n' "${file##*/}" "$directive"
      fi
    done < "$file"
  done
else
  echo "Nginx is not installed."
fi

section "Configured TLS certificate inventory"
if command -v openssl >/dev/null 2>&1; then
  for file in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [[ -f "$file" && -r "$file" ]] || continue
    while IFS= read -r line; do
      directive=${line%%#*}
      if [[ "$directive" =~ ^[[:space:]]*ssl_certificate[[:space:]]+([^[:space:];]+) ]]; then
        certificate=${BASH_REMATCH[1]}
        [[ "$certificate" == /* && "$certificate" != *'$'* ]] || continue
        if [[ -r "$certificate" ]]; then
          openssl x509 -in "$certificate" -noout -subject -issuer -dates -ext subjectAltName 2>/dev/null |
            sed 's/^/Nginx certificate: /' || echo "A configured public certificate could not be inspected."
        else
          echo "A configured public certificate is unreadable."
        fi
      fi
    done < "$file"
  done
fi

section "Firewall status"
if command -v ufw >/dev/null 2>&1; then ufw status verbose 2>&1; else echo "UFW unavailable."; fi
if command -v firewall-cmd >/dev/null 2>&1; then firewall-cmd --state 2>&1; else echo "firewalld unavailable."; fi
if command -v nft >/dev/null 2>&1; then
  nft list ruleset 2>/dev/null |
    awk '/^table / || /^[[:space:]]*chain / || /policy (accept|drop|reject)/ { print }' ||
    echo "nftables summary unavailable."
else
  echo "nftables unavailable."
fi
if command -v iptables >/dev/null 2>&1; then
  iptables -S 2>/dev/null | awk '/^-P / { print; next } END { print "iptables rules listed above; rule bodies omitted." }' ||
    echo "iptables policy inventory unavailable."
else
  echo "iptables unavailable."
fi

section "PostgreSQL availability"
if command -v pg_lsclusters >/dev/null 2>&1; then pg_lsclusters 2>&1 || true; else echo "pg_lsclusters unavailable."; fi
if command -v pg_isready >/dev/null 2>&1; then pg_isready -h 127.0.0.1 -p 5432 2>&1 || true; else echo "pg_isready unavailable."; fi

section "DNS lookup"
if command -v getent >/dev/null 2>&1; then
  getent ahosts "$domain" 2>/dev/null | awk '{ print $1 }' | sort -u ||
    echo "No system resolver result for $domain."
else
  echo "getent unavailable."
fi

echo
echo "Read-only inventory complete. No service, firewall, package, database, DNS, or Nginx configuration was changed."

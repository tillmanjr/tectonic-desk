#!/usr/bin/env bash
# Restrict the droplet's web ports to Cloudflare's edge, so nothing reaches the
# origin except through the proxy (and through any Access policy in front of it).
# Fetches the current ranges from Cloudflare, replaces the ufw rules for 80 and
# 443, and leaves SSH alone. Idempotent: run it again whenever Cloudflare's list
# changes (https://www.cloudflare.com/ips/). Run as root on the droplet.
set -euo pipefail

v4=$(curl -fsS https://www.cloudflare.com/ips-v4)
v6=$(curl -fsS https://www.cloudflare.com/ips-v6)
count=$(printf '%s\n%s\n' "$v4" "$v6" | grep -c '/')
if [ "$count" -lt 10 ]; then
  echo "unexpectedly short Cloudflare list ($count ranges); leaving the firewall alone" >&2
  exit 1
fi

# Drop every existing rule on 80/443, whether the open ones from setup or an older run of this script.
while read -r num; do
  ufw --force delete "$num" >/dev/null
done < <(ufw status numbered | grep -E '\b(80|443|80,443)(/tcp)?\b' | grep -oE '^\[ *[0-9]+\]' | tr -d '[] ' | sort -rn)

for cidr in $v4 $v6; do
  ufw allow from "$cidr" to any port 80,443 proto tcp comment cloudflare >/dev/null
done

echo "web ports now accept $count Cloudflare ranges only:"
ufw status | grep -cE 'cloudflare' | sed 's/^/  rules: /'
ufw status | grep -E '^(OpenSSH|22)' | head -2

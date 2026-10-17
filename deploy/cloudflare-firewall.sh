#!/usr/bin/env bash
# Let the droplet's web ports answer Cloudflare's edge only, so nothing reaches the
# origin around the proxy (or around an Access policy in front of it).
#
# ufw cannot do this on its own: Docker routes published ports through its own
# FORWARD rules before ufw's, so this script fills Docker's DOCKER-USER hook with a
# chain that returns for Cloudflare's ranges and drops everything else on 80/443.
# SSH is untouched. Idempotent; the systemd unit beside it re-applies the rules on
# boot and the timer refreshes the ranges weekly (https://www.cloudflare.com/ips/).
# Run as root on the droplet.
set -euo pipefail

CACHE=/var/lib/cloudflare-ips.txt
CHAIN=CLOUDFLARE_ONLY

fetch() {
  {
    curl -fsS https://www.cloudflare.com/ips-v4
    echo
    curl -fsS https://www.cloudflare.com/ips-v6
    echo
  } | grep '/'
}

if list=$(fetch) && [ "$(printf '%s\n' "$list" | wc -l)" -ge 10 ]; then
  printf '%s\n' "$list" > "$CACHE"
elif [ -s "$CACHE" ]; then
  list=$(cat "$CACHE")
  echo "Cloudflare list unavailable; using the cached copy" >&2
else
  echo "no Cloudflare list available; leaving the firewall alone" >&2
  exit 1
fi

iface=$(ip -o route show default | awk '{print $5; exit}')

apply() {
  local ipt=$1 ranges=$2
  $ipt -N "$CHAIN" 2>/dev/null || $ipt -F "$CHAIN"
  for cidr in $ranges; do
    $ipt -A "$CHAIN" -s "$cidr" -j RETURN
  done
  $ipt -A "$CHAIN" -j DROP
  # Jump into the chain for web traffic arriving from the internet, inserted once.
  if ! $ipt -C DOCKER-USER -i "$iface" -p tcp -m multiport --dports 80,443 -j "$CHAIN" 2>/dev/null; then
    $ipt -I DOCKER-USER -i "$iface" -p tcp -m multiport --dports 80,443 -j "$CHAIN"
  fi
  if ! $ipt -C DOCKER-USER -i "$iface" -p udp --dport 443 -j "$CHAIN" 2>/dev/null; then
    $ipt -I DOCKER-USER -i "$iface" -p udp --dport 443 -j "$CHAIN"
  fi
}

apply iptables "$(printf '%s\n' "$list" | grep -v ':')"
apply ip6tables "$(printf '%s\n' "$list" | grep ':')"

echo "web ports on $iface accept $(printf '%s\n' "$list" | wc -l) Cloudflare ranges only"

#!/usr/bin/env bash
# Default-deny egress with a DYNAMIC domain allowlist. Run as root at
# container start (requires --cap-add NET_ADMIN). The agent user cannot alter
# iptables or dnsmasq.
#
#   ALLOW_DOMAINS        base allowlist (space-separated); default covers the
#                        Anthropic API + GitHub
#   EXTRA_ALLOW_DOMAINS  per-repo additions (registries: pub.dev,
#                        storage.googleapis.com…) — supplied as config, the
#                        engine stays stack-blind
#   SAKAL_URL            if set, its host is allowlisted (integrated mode)
#
# Mechanics (v2 — the static-ipset design failed in the first live drain:
# anycast CDNs like storage.googleapis.com rotate IPs between the start-time
# resolve and the actual connection, so the resolved set went stale in
# minutes): dnsmasq is the container's ONLY resolver, configured with
# `ipset=/domain/allowed` for every allowlisted domain — every answer it
# hands out is inserted into the ipset AT RESOLUTION TIME, so a connection
# can never race ahead of its own DNS. Non-allowlisted domains still resolve
# (harmlessly) but their IPs never enter the set, so connections drop.
set -euo pipefail

ALLOW_DOMAINS="${ALLOW_DOMAINS:-api.anthropic.com statsig.anthropic.com sentry.io github.com api.github.com codeload.github.com objects.githubusercontent.com raw.githubusercontent.com ghcr.io}"
if [ -n "${SAKAL_URL:-}" ]; then
  ALLOW_DOMAINS="$ALLOW_DOMAINS $(echo "$SAKAL_URL" | sed -E 's|^[a-z]+://||; s|/.*$||')"
fi
ALLOW_DOMAINS="$ALLOW_DOMAINS ${EXTRA_ALLOW_DOMAINS:-}"

UPSTREAM=$(grep -m1 '^nameserver' /etc/resolv.conf | awk '{print $2}')
[ -z "$UPSTREAM" ] && UPSTREAM=1.1.1.1

ipset destroy allowed 2>/dev/null || true
ipset create allowed hash:ip timeout 3600   # entries refresh on every lookup

# dnsmasq: the only resolver; every allowlisted answer lands in the ipset.
{
  echo "listen-address=127.0.0.1"
  echo "bind-interfaces"
  echo "no-resolv"
  echo "server=$UPSTREAM"
  for d in $ALLOW_DOMAINS; do echo "ipset=/$d/allowed"; done
} > /etc/dnsmasq.d/allowlist.conf
dnsmasq --conf-dir=/etc/dnsmasq.d
echo "nameserver 127.0.0.1" > /etc/resolv.conf

# Seed the set so the first connections don't race the first lookups.
for d in $ALLOW_DOMAINS; do dig +short A "$d" @127.0.0.1 >/dev/null 2>&1 || true; done

iptables -F OUTPUT
iptables -P OUTPUT DROP
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
# DNS: only dnsmasq (root) talks upstream; the agent talks to 127.0.0.1.
iptables -A OUTPUT -p udp --dport 53 -m owner --uid-owner 0 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -m owner --uid-owner 0 -j ACCEPT
iptables -A OUTPUT -p tcp -m set --match-set allowed dst -m multiport --dports 443,80 -j ACCEPT
# Everything else: dropped. No exceptions, no "temporary" holes.

echo "[firewall] up (dynamic dns→ipset): default-deny egress; allowlist: $ALLOW_DOMAINS"

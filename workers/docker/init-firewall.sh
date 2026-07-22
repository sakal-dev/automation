#!/usr/bin/env bash
# Default-deny egress with a domain allowlist. Run as root at container start
# (requires --cap-add NET_ADMIN). The agent user cannot alter iptables.
#
#   ALLOW_DOMAINS        base allowlist (space-separated); default covers the
#                        Anthropic API + GitHub
#   EXTRA_ALLOW_DOMAINS  per-repo additions (registries: pub.dev, npmjs.org…)
#                        — supplied as config, the engine stays stack-blind
#   SAKAL_URL            if set, its host is allowlisted (integrated mode)
#
# Mechanics: resolve each domain now, load the IPs into an ipset, allow 443/80
# to set members + DNS + loopback + established; drop everything else. CDNs
# rotate IPs — re-run this script (or restart the container) if a host starts
# failing; a firewall that needs a refresh is preferred over open egress.
set -euo pipefail

ALLOW_DOMAINS="${ALLOW_DOMAINS:-api.anthropic.com statsig.anthropic.com sentry.io github.com api.github.com codeload.github.com objects.githubusercontent.com raw.githubusercontent.com ghcr.io}"
if [ -n "${SAKAL_URL:-}" ]; then
  ALLOW_DOMAINS="$ALLOW_DOMAINS $(echo "$SAKAL_URL" | sed -E 's|^[a-z]+://||; s|/.*$||')"
fi
ALLOW_DOMAINS="$ALLOW_DOMAINS ${EXTRA_ALLOW_DOMAINS:-}"

ipset destroy allowed 2>/dev/null || true
ipset create allowed hash:ip

echo "[firewall] resolving allowlist…"
for d in $ALLOW_DOMAINS; do
  for ip in $(dig +short A "$d" | grep -E '^[0-9.]+$' || true); do
    ipset add allowed "$ip" 2>/dev/null || true
  done
done

iptables -F OUTPUT
iptables -P OUTPUT DROP
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp -m set --match-set allowed dst -m multiport --dports 443,80 -j ACCEPT
# Everything else: dropped. No exceptions, no "temporary" holes.

echo "[firewall] up: default-deny egress; $(ipset list allowed | grep -c '^[0-9]') allowed IPs for: $ALLOW_DOMAINS"

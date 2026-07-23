# The VPS sandbox image (methods 4 & 5). Non-root, egress-firewalled, no
# stack toolchains — the checked-out repo's tool/setup.sh installs its own
# (stack-blind holds on the VPS too). The loop runs
# --dangerously-skip-permissions, so the sandbox is NOT optional: the
# permission mode decides what the agent asks; the sandbox decides what is
# possible. Both, always.
FROM node:22-bookworm-slim

# Agent tooling only: Claude Code, gh, git, jq, curl + firewall tools.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates jq iptables ipset dnsutils dnsmasq procps gosu bash \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @anthropic-ai/claude-code

# Non-root agent user; /workspace is the ONLY writable surface it needs.
RUN useradd -m -s /bin/bash agent && mkdir -p /workspace && chown agent:agent /workspace

COPY init-firewall.sh /usr/local/bin/init-firewall.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/init-firewall.sh /usr/local/bin/entrypoint.sh

WORKDIR /workspace
# Entrypoint: raise the firewall as root (needs --cap-add NET_ADMIN), then
# drop to the agent user and exec the worker command.
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["bash", "-lc", "echo 'sandbox up — mount a worker (workers/headless-loop/loop.sh) and run it' && sleep infinity"]

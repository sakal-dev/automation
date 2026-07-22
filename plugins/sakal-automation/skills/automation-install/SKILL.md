---
name: automation-install
description: Onboard a repo to sakal agent automation, end to end, in under 30 minutes with no manual YAML. Use when the user says "set up agent automation here", "install sakal automation", "onboard this repo to automation", "add the agent workflows to this project", or asks how to make agents work on a repo.
---

# automation-install

**STATUS: DRAFT STUB — outline only. Written for real after the garage
extraction proves the reusable workflows.**

Turns any repo into a caller of `sakal-dev/automation`. Knowledge lives here;
enforcement lives in the workflows this skill installs (NOTES.md §1 rule of
thumb). Everything installed obeys `docs/task-contract.md`.

## Body outline

1. **Ask the one question first**: standalone (`source: github`) or integrated
   (`source: sakalmaster`)? If integrated: which project and which APP this
   repo is (one repo = one app; the claim filter depends on it).
2. **Detect the stack** — Flutter / Laravel / Node-React / Electron-pnpm —
   from lockfiles and manifests; confirm with the user.
3. **Write the two scripts** from `../../templates/`: `tool/setup.sh` and
   `tool/verify.sh`. These are the repo's own property — the engine stays
   stack-blind.
4. **Write the caller workflows** (~10 lines each) pinned to `@v1`, never
   `@main`: sweep (off-peak cron minute, not :00/:30), on-demand, automerge,
   claude-done, and verify (integrated only).
5. **Create the labels and the issue template** — the queue's visible states
   and the brief's stable shape.
6. **Append the CLAUDE.md section** from the template: denylist, "agents never
   verify their own claims", how to summon @claude.
7. **Secrets checklist** — org-level `CLAUDE_CODE_OAUTH_TOKEN` + `SAKAL_TOKEN`
   reachable from this repo; app installed. Print what's missing; never
   handle secret values directly.
8. **Smoke test** — one labelled test issue; watch it drain through the gate.

# SakalAutomation — roadmap

Session map for this repo, same convention as SakalMaster's ROADMAP.md: what
landed, what's next, and the dependency edges. Update when a session lands.
Session prompts live in `docs/prompts/` (local, gitignored).

**Sibling project:** `SakalMaster` (`sakal-dev/sakalmaster`, live on
`master-staging.sakal.dev`) is the truth/ledger half — agents built here read from
and report to it. How they connect, who owns what, and the convergence sequence:
see SakalMaster's `docs/JOINT-ROADMAP.md`. **Phase 3 reached 2026-07-24**: garage
runs integrated on staging (engine v2, OIDC, zero repo secrets); a merged agent PR
flipped an AC to `enforced` in 9 seconds. Next joint milestone: production cutover
(SM session 17).

## Sessions

| # | Session | State | Delivers |
|---|---|---|---|
| 1 | Init & skeleton | ✅ | Task contract (the spec) · self-documenting stubs · constraints doc · methods lab notebook 01–07 |
| 2 | Garage extraction | ✅ | Engine real, `v1.0.0` cut + floating `v1`; garage = caller #1 (578→102 lines); parity proven on real issues (methods/03 verdict). Last human click: `auto-merge` on PR #105 |
| — | Issue & context system | ✅ (via Cowork) | 10 typed issue forms + labels.sh + skeletons · `docs/issues.md` (incl. org `.github` defaults trick) · `docs/context.md` (five-layer model) · CLAUDE.md template with `@import` rules + rotating changelog |
| — | Content import skill | ✅ (via Cowork, plugin v0.2.0) | `sakal-import` — repo specs → SakalMaster journeys/epics/stories/ACs, open issues → bugs/tasks; idempotent (`spec:`/`github:` keys), statuses never import, dry-run gate. Model: SakalMaster `docs/CONTENT-PLAYBOOK.md` |
| 3 | The plugin | ✅ | Both skills real; all templates built (script pairs, callers, RULES, changelog); `sakal-dev/.github` org defaults live. Acceptance: sakalpos-owner onboarded in **14m11s**, no manual YAML; sweep smoke waits on the repo's `CLAUDE_CODE_OAUTH_TOKEN` |
| 4 | Sakal source | ✅ (flip deferred) | `claim-sakal`/`report-sakal`/`verify.yml` real; dual-source sweep (github default, parity re-checked); 10/10 local-stack test. App filter FILED as sakal-dev/sakalmaster#1 (stories carry app_id — small change); succeeded-doesn't-retire-task finding encoded (park on success). Live garage flip: exact steps in methods/03, waits on staging + the filter |
| 5 | Dispatch (methods 1–2) | ✅ (experiments pending human) | Skill real (brief format + verbatim standing block + check-on-dispatch). Method-1 experiment prepared, needs the human's browser session; method-2 blocked: no Codex account (logged honestly) |
| 6 | Headless worker (method 4) | ✅ built/local-verified | Sandbox image + default-deny egress (verified), loop over shared `workers/lib` lifecycle, systemd unit, kill test PASSED (found + fixed the foreground-trap SIGTERM gap). Real 2-issue drain waits on a worker `CLAUDE_CODE_OAUTH_TOKEN` |
| 7 | SDK worker (method 5) | ✅ built | TS service compiles against the real SDK; PreToolUse hook = the denylist as CODE (probe 10/10); REST claim path chosen (one lifecycle, no drift). Live drain + hook-fire proof ride with 6's token |
| 8 | Fleet & interfaces (methods 6–7) | ✅ recipes + mock experiment | Fleet compose (one service per identity — per-replica tokens are CORRECTNESS, see methods/07: double-claim + rate-limited releases observed and hardened against); OpenClaw recipe with the read+dispatch-never-write rule. Real-agent fleet rides with 6/7 |
| 9 | **Integrated flip** | ✅ **2026-07-24** | Garage `source: sakalmaster` LIVE on engine v2 + OIDC — **zero repo secrets/vars**. Full loop proven: claim → brief (derived AC statuses inlined) → PR #120 → mechanical judge → merge → verify-on-merge flipped AC-2 `broken→enforced` in 9s. Mirror rule structural; rollback drilled both directions (#119/PR #122). v2.0.1–.3 hardenings earned by the first runs (mechanical lifecycle; schema dry-run rule) |
| 10 | **Token day (live drains)** | 🟡 mostly done 2026-07-23 | Methods 4+5 drained real issues (PRs #9/#10/#12/#13; 9 engine defects found+fixed); hook fired live; kill tests passed; owner smoke closed. **Remaining:** real-agent fleet (needs a 2nd per-replica token) · method-1 dispatch (needs the human's browser) |
| 11 | Ops hardening (close-out) | 🟡 2026-07-24 | `VERDICT.md` written (real data; matrix per repo class) · engine **v2.1.0** (mechanical self-redispatch + REST label ops — earned only) · `SECRETS-INVENTORY.md` · org-plan RESOLVED (Team, 07-23) · `RUNBOOK.md` (4 earned entries) · operate skill: mode check + integrated diagnosis. **Remaining:** chain fire-path live observation; the two row-10 user-gated items |

## Dependency edges

- 3 needs 2's parity + `v1.0.0` (the skill installs callers against a stable tag).
- 4 needs SakalMaster staging + the app-filter claim; until then integrated mode
  waits, standalone keeps working.
- 5 needs 3 (dispatch uses the skeleton/brief shapes the plugin ships).
- 6–7 run standalone (github mode) any time after 2; integrated mode after 4.
  PATs (SakalMaster session 10) already exist for their credentials.
- 8 needs at least one of 6/7 alive.

## Standing duties (every session)

- Lab notebook: every method experiment records setup, cost, verdict in
  `docs/methods/NN`.
- Contract conformance: anything new answers `docs/task-contract.md`'s checklist.
- Do-not-regress rules in `BRIEF.md` §Rules hold everywhere.
- If a form/skeleton/template changes, its twin changes in the same commit.

## The finish line

A new repo joins the ecosystem with: `/plugin install sakal-automation` → "set up
agent automation here" → 30 minutes later it has typed issues, labels, guarded
CLAUDE.md, the caller workflows, and a working queue — standalone on GitHub, or
integrated with SakalMaster by flipping one input. Every one of the seven
execution methods can serve it, and every experiment that got us there is written
down in `docs/methods/`.

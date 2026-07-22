# SakalAutomation — roadmap

Session map for this repo, same convention as SakalMaster's ROADMAP.md: what
landed, what's next, and the dependency edges. Update when a session lands.
Session prompts live in `docs/prompts/` (local, gitignored).

## Sessions

| # | Session | State | Delivers |
|---|---|---|---|
| 1 | Init & skeleton | ✅ | Task contract (the spec) · self-documenting stubs · constraints doc · methods lab notebook 01–07 |
| 2 | Garage extraction | 🟡 | Engine real (4 workflows + 2 actions, findings folded, floating `v1`); garage = caller #1 (578→102 lines). **Remaining:** parity legs 2–5 → cut immutable `v1.0.0` → method-03 verdict |
| — | Issue & context system | ✅ (via Cowork) | 10 typed issue forms + labels.sh + skeletons · `docs/issues.md` (incl. org `.github` defaults trick) · `docs/context.md` (five-layer model) · CLAUDE.md template with `@import` rules + rotating changelog |
| 3 | The plugin | ⏳ next after 2 | `automation-install` + `automation-operate` skills for real, wiring ALL templates (callers, tool/ scripts, issue system, labels, CLAUDE.md/RULES/changelog). Acceptance: onboard one Laravel or React repo in <30 min, no manual YAML. Also: create `sakal-dev/.github` org defaults |
| 4 | Sakal source | ⏳ | `claim-sakal` / `report-sakal` actions real (per SakalMaster `docs/ci/agent-runs.md`) · `verify.yml` real · flip garage to integrated mode. **Needs:** SakalMaster staging (its session 11 track B) + the `claim_next_task(project, app)` app filter |
| 5 | Dispatch (methods 1–2) | ⏳ | `automation-dispatch` skill: assemble brief → hand to Claude Code on the web / Codex cloud; PRs return into the same gate. Lab entries for methods 01–02 |
| 6 | Headless worker (method 4) | ⏳ | `workers/headless-loop` real: Docker sandbox (non-root, egress firewall) + systemd unit + dual-source polling. First VPS experiment; lab entry 04 |
| 7 | SDK worker (method 5) | ⏳ | `workers/sdk-worker`: Agent SDK + sakalmaster MCP. The long-term worker; lab entry 05 |
| 8 | Fleet & interfaces (methods 6–7) | ⏳ | Recipes only: N workers in parallel (the DB lease makes N safe) · OpenClaw as phone→dispatch interface. Lab entries 06–07 |
| 9 | Ops hardening | ⏳ later | Cost/method comparison from the lab notebook · release discipline review · org-plan upgrade migration (org secrets) · anything the first months of real runs teach |

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

#!/usr/bin/env node
// =============================================================================
// sakal-scope — validate a DECLARED scope against reality, before any write.
//
// The command names now say which layer you are onboarding, because a command
// surface that stops to ask "which layer is this?" is a surface that failed.
// But a name is a claim, and a claim needs checking: this script is what makes
// mis-declaring impossible rather than merely discouraged.
//
// It checks the declaration against two facts that cannot be argued with:
//   1. this repo's git origin, resolved against the project's linked codebases
//   2. any `.sakal/config.yaml` already on disk
//
// Refusals are in plain words with the place to go. Exit 0 = proceed,
// 1 = refuse, 2 = proceed but the human must confirm something first.
//
//   node sakal-scope.mjs --declared project|app --repo-root . \
//        [--apps apps.json]   # [{"app":"garage","repo":"sakal-dev/sakalpos-garage"}]
//        [--project-layer-empty]
// =============================================================================
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const has = n => args.includes(n)
const DECLARED = opt('--declared', '')
const ROOT = opt('--repo-root', '.')
const APPS = opt('--apps', null)
const EMPTY_LAYER = has('--project-layer-empty')

if (!['project', 'app'].includes(DECLARED)) {
  console.error('--declared must be "project" or "app"'); process.exit(2)
}

const say = s => console.log(s)
const refuse = (msg, where) => { say(`REFUSED — ${msg}`); if (where) say(`  ${where}`); process.exit(1) }

// ── fact 1: what repo is this, and is it a linked codebase? ─────────────────
let origin = null
try { origin = execSync('git remote get-url origin', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch {}
const slugOf = url => {
  if (!url) return null
  const m = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/)
  return m ? m[1] : null
}
const repoSlug = slugOf(origin)

let apps = null
if (APPS) { try { apps = JSON.parse(readFileSync(APPS, 'utf8')) } catch { apps = null } }
const linked = apps && repoSlug ? apps.find(a => (a.repo || '').toLowerCase() === repoSlug.toLowerCase()) : null

// ── fact 2: what does an existing .sakal/ already say? ──────────────────────
const cfgPath = join(ROOT, '.sakal', 'config.yaml')
let existingScope = null, existingApp = null
if (existsSync(cfgPath)) {
  const t = readFileSync(cfgPath, 'utf8')
  existingScope = (t.match(/^scope:\s*(\S+)/m) || [])[1] || null
  existingApp = (t.match(/^app:\s*(\S+)/m) || [])[1] || null
}

say(`  repo:      ${repoSlug ?? '(no git origin)'}`)
say(`  declared:  scope: ${DECLARED}`)
say(`  on disk:   ${existingScope ? `.sakal/config.yaml says scope: ${existingScope}` : 'no .sakal/ yet'}`)
say(`  linked:    ${linked ? `yes — app "${linked.app}"` : apps ? 'no linked codebase for this repo' : '(codebase list not supplied)'}`)
say('')

// ── the refusals ────────────────────────────────────────────────────────────
// Never silently rewrite a scope. A directory that changed layer under someone
// is worse than a refusal they can read.
if (existingScope && existingScope !== DECLARED) {
  refuse(
    `this repo's .sakal/ is already scope: ${existingScope}, and you ran the ${DECLARED} command.`,
    existingScope === 'app'
      ? 'Use /sakal-onboard-app here. If this repo really should own the project layer, change .sakal/config.yaml deliberately — this command will not do it for you.'
      : 'Use /sakal-onboard-project here. If this repo should only carry stories, change .sakal/config.yaml deliberately — this command will not do it for you.')
}

if (DECLARED === 'app') {
  if (apps && !linked) {
    refuse(
      'onboarding the APP layer here, but this repo is not a linked codebase in the project.',
      'Link it first: SakalMaster → Settings → Codebases → add this repository. Then re-run /sakal-onboard-app.')
  }
  if (!apps) {
    say('CANNOT CONFIRM — the codebase list was not supplied, so the app link is unverified.')
    say('  Read the project\'s codebases from the server and pass --apps before writing.')
    process.exit(2)
  }
  say(`PROCEED — app layer for "${linked.app}". The project layer is read from the server and referenced, never re-drafted.`)
  process.exit(0)
}

// DECLARED === 'project'
if (linked) {
  // Allowed, but it is a real decision: a spec-home that is also a codebase is
  // fine and common in single-repo projects, and confusing in a big one.
  say(`CONFIRM — this repo IS a linked codebase ("${linked.app}") and you are onboarding the PROJECT layer.`)
  say('  That is legitimate: a single-repo project keeps both layers here, and a')
  say('  spec-home may also ship code. In a multi-repo project it is usually a')
  say('  mistake — the project layer belongs in one dedicated place.')
  say('  Confirm before writing.')
  process.exit(2)
}
if (EMPTY_LAYER) {
  say('PROCEED — first run. No .sakal/ here and the project layer on the server is empty.')
  say('  This creates the project layer from scratch: registry/, journeys.yaml, epics.yaml.')
  process.exit(0)
}
say('PROCEED — project layer.')
process.exit(0)

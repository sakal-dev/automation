// =============================================================================
// sakal-shared — the functions the writer and the checker MUST agree on.
//
// SKA-024's rule: prepare's output must pass prepare's own linter, byte for
// byte. Every divergence between what we emit and what we accept is a bug in
// this plugin, never homework for the operator.
//
// The first real offline run produced 100 errors on a healthy tree, ~99 of them
// the plugin disagreeing with itself: two sluggers that treated `·` and
// apostrophes differently, and a config reader that kept inline comments so a
// declared value could never equal anything. Both are one function now, and
// they live here so there is nowhere for a second copy to hide.
//
// Zero dependencies, still. No YAML library.
// =============================================================================
import { readFileSync } from 'node:fs'

// ── ONE comment-aware scalar reader ─────────────────────────────────────────
// Strips a trailing ` #…` comment, but never one inside a quoted value:
// `name: "Bar # Grill"` keeps its hash. Handles CRLF and trailing whitespace,
// because a parser that cares about line endings is a parser that will bite
// someone on Windows.
export function stripInlineComment(value) {
  let out = '', quote = null
  for (let i = 0; i < value.length; i++) {
    const c = value[i]
    if (quote) { out += c; if (c === quote && value[i - 1] !== '\\') quote = null; continue }
    if (c === '"' || c === "'") { quote = c; out += c; continue }
    // A comment needs whitespace before the # (or to start the value), so a
    // bare `key: a#b` is not silently truncated.
    if (c === '#' && (i === 0 || /\s/.test(value[i - 1]))) break
    out += c
  }
  return out.replace(/\r$/, '').trim()
}

/** Read `key: value` scalars from a config-ish file. Comments stripped, once. */
export function readScalars(text) {
  const out = {}
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '')
    if (!line.trim() || line.trimStart().startsWith('#')) return
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/)
    if (!m) return
    const v = stripInlineComment(m[2])
    if (v !== '') out[m[1]] = { value: unquote(v), line: i + 1 }
  })
  return out
}

export function unquote(v) {
  if (v.length > 1 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) return v.slice(1, -1)
  return v
}

// ── ONE slugger ─────────────────────────────────────────────────────────────
// GitHub's heading-anchor semantics, because that is what prepare emitted and
// what every markdown reader in the fleet already produces:
//   lowercase → drop everything that is not alphanumeric, space or hyphen
//   (so `·` and `'` VANISH rather than becoming separators) → spaces to hyphens.
//
// The vanishing matters: "OA-02-01 · Today's headline numbers" leaves a DOUBLE
// space where the `·` was, and therefore a double hyphen. Collapsing runs — the
// old verify behaviour — produced a different string and reported 31 healthy
// sources as missing.
//
// Idempotent on an already-slugged string, which is what lets the matcher pass
// both sides through it and still match anchors written by older versions.
export function slug(heading) {
  return String(heading)
    .replace(/\r$/, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} \-]/gu, '')
    .replace(/ /g, '-')
}

/** Heading anchors of a markdown file, plus any that collide. */
export function anchorsOf(path) {
  const seen = new Map()
  let text = ''
  try { text = readFileSync(path, 'utf8') } catch { return { set: new Set(), duplicates: [] } }
  for (const raw of text.split('\n')) {
    const m = raw.replace(/\r$/, '').match(/^#{1,6}\s+(.*?)\s*$/)
    if (!m) continue
    const s = slug(m[1])
    seen.set(s, (seen.get(s) ?? 0) + 1)
  }
  return { set: new Set(seen.keys()), duplicates: [...seen].filter(([, n]) => n > 1).map(([s]) => s) }
}

/** Does `anchor` identify a section of `path`? Both sides go through slug(). */
export function anchorMatches(path, anchor) {
  const { set, duplicates } = anchorsOf(path)
  const want = slug(anchor)
  const hit = [...set].some(a => a === want || a.startsWith(want))
  return { hit, duplicate: duplicates.includes(want), known: [...set] }
}

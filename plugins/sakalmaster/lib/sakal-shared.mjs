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

/** Heading anchors of markdown TEXT (for content that came from `git show`). */
export function anchorsOfText(text) {
  const seen = new Map()
  for (const raw of String(text).split('\n')) {
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

/** Same check against text already in hand (a pinned `git show` read). */
export function anchorMatchesText(text, anchor) {
  const { set, duplicates } = anchorsOfText(text)
  const want = slug(anchor)
  const hit = [...set].some(a => a === want || a.startsWith(want))
  return { hit, duplicate: duplicates.includes(want), known: [...set] }
}

// ═════════════════════════════════════════════════════════════════════════════
// SKA-025 — the emission contract (Addendum A1). Everything below is shared by
// sakal-prepare.mjs (the writer) and sakal-verify.mjs (the checker) for the
// same reason slug() is: the moment either grows a private copy, prepare's
// output stops passing prepare's own linter and SKA-024 happens again.
// ═════════════════════════════════════════════════════════════════════════════

// ── ONE source-URI reader ───────────────────────────────────────────────────
// `<owner>/<repo>:<path>[#anchor][@short-sha]` (what prepare pins), or the
// older plain `<path>[#anchor]`. `@sha` binds tighter than `#anchor`.
export function parseSourceURI(src) {
  const s = String(src ?? '').trim()
  const m = s.match(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+):(.+)$/)
  const repo = m ? m[1] : null
  let rest = m ? m[2] : s
  let sha = null
  const at = rest.match(/^(.*)@([0-9a-f]{7,40})$/)
  if (at) { rest = at[1]; sha = at[2] }
  const [path, anchor] = rest.split('#')
  return { repo, path: (path ?? '').trim(), anchor: anchor?.trim() || null, sha }
}

/** Whitespace-normalised comparison form. THE fidelity rule: verbatim text,
 *  normalised whitespace only — nothing else is forgiven. */
export function normWS(s) { return String(s ?? '').replace(/\s+/g, ' ').trim() }

// ── ONE yaml scalar quoting pair ────────────────────────────────────────────
// AC text is emitted double-quoted so verbatim spec text (colons, hashes,
// leading brackets) survives yaml. Writer and reader must invert each other
// EXACTLY or fidelity fails on the plugin's own output.
export function yamlQuote(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' }
export function yamlUnquote(v) {
  const s = String(v).trim()
  if (s.length < 2 || s[0] !== '"' || s.at(-1) !== '"') return s
  let out = ''
  for (let i = 1; i < s.length - 1; i++) {
    if (s[i] === '\\' && (s[i + 1] === '"' || s[i + 1] === '\\')) { out += s[i + 1]; i++ }
    else out += s[i]
  }
  return out
}

/** Greedy wrap on spaces. 78 matches the fixtures; deterministic by being dumb. */
export function wrap(text, width = 78) {
  const words = String(text).split(/\s+/).filter(Boolean)
  const lines = []; let line = ''
  for (const w of words) {
    if (!line) line = w
    else if (line.length + 1 + w.length <= width) line += ' ' + w
    else { lines.push(line); line = w }
  }
  if (line) lines.push(line)
  return lines.join('\n')
}

/** AC letter for spec index 0..25. Refusing past `z` is the caller's job. */
export function acLetter(i) { return String.fromCharCode(97 + i) }

// ── ONE spec parser ─────────────────────────────────────────────────────────
// The shape of docs/specs/<EPIC>-*.md: an H1 title, a `> **Tier:** … ·
// **Priority:** …` header, `## `-level sections, and a `## Stories` section of
// `### <KEY> · <title>` blocks. Prepare emits FROM this parse; the fidelity
// gate compares AGAINST this parse (of the pinned `git show`) — same function,
// so a parser bug cannot pass its own output while failing the source.
export function parseSpec(text) {
  const lines = String(text).split('\n').map(l => l.replace(/\r$/, ''))
  const spec = { title: null, tier: null, priority: null, sections: [], stories: [], statusHeaderSeen: false, statusHeaderRaw: null, headerExtrasRaw: [] }
  let section = null, story = null, inStories = false

  const h1 = lines.find(l => /^#\s+\S/.test(l))
  if (h1) {
    const seg = h1.replace(/^#\s+/, '').split(' · ')
    spec.title = (seg.length >= 3 && /^\d+$/.test(seg[1].trim())) ? seg.slice(2).join(' · ').trim() : seg.join(' · ').trim()
  }
  for (const l of lines) {
    if (!l.startsWith('>')) continue
    const t = l.match(/\*\*Tier:\*\*\s*([^·]+?)(?:\s*·|$)/); if (t && spec.tier == null) spec.tier = t[1].trim()
    const p = l.match(/\*\*Priority:\*\*\s*([^·\s]+)/); if (p && spec.priority == null) spec.priority = p[1].trim()
    if (/\*\*Status:\*\*/.test(l)) { spec.statusHeaderSeen = true; spec.statusHeaderRaw ??= l.replace(/^>\s*/, '') }
    // S4 (A2): header keys beyond the four known ones — Consumes, Implements,
    // Journey(s), whatever a family invents — captured VERBATIM, key + value.
    // Mapping them to real project-layer keys is promote-time work, never
    // extraction-time normalization.
    const extra = l.match(/^>\s*(\*\*(?!Tier:|Priority:|Story prefix:|Status:)[^*]+:\*\*.*)$/)
    if (extra) spec.headerExtrasRaw.push(extra[1].trim())
  }

  const endSection = () => {
    if (!section) return
    while (section.body.length && !section.body[0].trim()) section.body.shift()
    while (section.body.length && !section.body.at(-1).trim()) section.body.pop()
    spec.sections.push({ heading: section.heading, body: section.body.join('\n') })
    section = null
  }
  const endStory = () => { if (story) spec.stories.push(story); story = null }

  lines.forEach((l, idx) => {
    const h2 = l.match(/^##\s+(.*?)\s*$/)
    if (h2 && !l.startsWith('###')) {
      endStory(); endSection()
      inStories = normWS(h2[1]) === 'Stories'
      if (!inStories) section = { heading: h2[1], body: [] }
      return
    }
    if (inStories) {
      const h3 = l.match(/^###\s+(\S+)\s+·\s+(.*?)\s*$/)
      if (h3) { endStory(); story = { key: h3[1], title: h3[2], anchor: slug(l.replace(/^###\s+/, '')), article: null, persona: null, want: null, soThat: null, acs: [], priority: null, statusTrailerRaw: null, context: null, line: idx + 1 }; return }
      if (!story) return
      let m
      if ((m = l.match(/^\*\*As (a|an|the)\*\*\s+(.*?)\s*$/))) { story.article = m[1]; story.persona = m[2]; return }
      if ((m = l.match(/^\*\*I want\*\*\s+(.*?)\s*$/))) { story.want = m[1]; return }
      if ((m = l.match(/^\*\*So that\*\*\s+(.*?)\s*$/))) { story.soThat = m[1]; return }
      // S2 (A2): the checkbox marker is captured RAW — `[ ]`, `[x]`, `[~]`,
      // `[🟡]`, anything — recorded, never interpreted, never a filter. A
      // checked box is an assertion; assertions do not survive into status.
      if ((m = l.match(/^-\s+\[([^\]]*)\]\s+AC-(\d+)\s+—\s+(.*?)\s*$/))) { story.acs.push({ n: Number(m[2]), marker: `[${m[1]}]`, text: m[3], line: idx + 1 }); return }
      if ((m = l.match(/^(\*\*Priority:\*\*\s*(\S+).*)$/))) { story.priority = m[2].replace(/·.*/, '').trim(); if (/\*\*Status:\*\*/.test(m[1])) story.statusTrailerRaw = m[1].trim(); return }
      // S3 (A2): when a family has no As/I-want/So-that triple, the first
      // plain paragraph line is kept as PROVENANCE CONTEXT only — never
      // promoted to a fabricated story sentence.
      if (story.context == null && l.trim() && !l.startsWith('**') && !l.startsWith('-') && !l.startsWith('#') && l.trim() !== '---') story.context = l.trim()
      return
    }
    if (section) section.body.push(l)
  })
  endStory(); endSection()
  return spec
}

// ── S1 (A2): the loud-fail invariant, as a function ─────────────────────────
// Count every AC-LIKE line in a spec file: any checkbox list item (any marker),
// any list item carrying an `AC-n` label, any list item inside an
// "acceptance criteria" heading span. The CALLER compares this against what
// parseSpec actually parsed: parsed < detected ⇒ refuse with file:line.
// Zero-AC extraction from an AC-bearing file is impossible by construction —
// a coverage assertion, not reviewer vigilance.
export function detectAcLines(text) {
  const lines = String(text).split('\n').map(l => l.replace(/\r$/, ''))
  const out = new Map()  // line number (1-based) → raw text
  let inAcSpan = false
  lines.forEach((l, i) => {
    if (/^#{1,6}\s|^\*\*[^*]+\*\*\s*$/.test(l)) inAcSpan = /acceptance criteria/i.test(l)
    const isItem = /^\s*-\s+\S/.test(l)
    if (!isItem) return
    const checkbox = /^\s*-\s+\[[^\]]{0,8}\]\s/.test(l)
    const acLabel = /\bAC-\d+\b/.test(l)
    if (checkbox || acLabel || inAcSpan) out.set(i + 1, l.trim())
  })
  return out
}

// ── the SKA-025 emission renderers ──────────────────────────────────────────
// Used by sakal-prepare.mjs AND by the golden suite, so the tests exercise the
// exact bytes production emits. Deterministic: stable field order, one wrap
// width, LF, trailing newline.

/** Epic doc: frontmatter + the spec's non-Stories sections VERBATIM.
 *  The `Status:` header and its markers are never imported (E5). */
export function renderEpicDoc(spec, { epicKey, app, specRel, repoId, pin }) {
  const fm = [
    `key: ${epicKey}`, `title: ${spec.title}`, `app: ${app}`,
    `tier: ${spec.tier ?? ''}`, `priority: ${spec.priority ?? ''}`,
    `source: ${repoId}:${specRel}@${pin}`,
  ]
  const sections = spec.sections.map(s => `## ${s.heading}\n\n${s.body}`).join('\n\n')
  return `---\n${fm.join('\n')}\n---\n\n${sections}\n`
}

/** Story doc: preserved frontmatter + authored sentence (or NONE — S3 never
 *  fabricates) + fenced-yaml ACs with VERBATIM text, raw non-default markers
 *  (S2) and grep-confirmed cites (Q6 shape). `cites` maps AC letter → list. */
export function renderStoryDoc(st, { epicKey, app, specRel, repoId, pin, journey, persona, module, cites }) {
  const fmLines = [`key: ${st.key}`, `title: ${st.title}`, `epic: ${epicKey}`]
  if (journey) fmLines.push(`journey: ${journey}`)
  fmLines.push(`persona: ${persona}`, `app: ${app}`)
  if (module) fmLines.push(`module: ${module}`)
  fmLines.push(`tags: [${st.priority ?? ''}]`, 'out_of_scope: []',
    `source: ${repoId}:${specRel}#${st.anchor}@${pin}`)

  // The sentence is AUTHORED (conventions govern it) — but only from a real
  // triple. A family without one gets an EMPTY story field, reported, because
  // fabrication is worse than absence (S3).
  let sentence = null
  if (st.persona != null && st.want != null && st.soThat != null) {
    const raw = `As ${st.article ?? 'a'} ${st.persona}, I want ${st.want}, so that ${st.soThat}`
    sentence = wrap(raw.replace(/\s+/g, ' ').trim() + (/[.!?]$/.test(st.soThat) ? '' : '.'))
  }

  const acBlocks = st.acs.map((ac, i) => {
    const letter = acLetter(i)
    const lines = [`- ac: ${st.key}-${letter}`]
    // S2: a non-default marker is data someone wrote — carried raw. The
    // default `[ ]` is omitted so the owner fixtures stay byte-stable.
    if (ac.marker && ac.marker !== '[ ]') lines.push(`  marker: ${yamlQuote(ac.marker)}`)
    lines.push(`  text: ${yamlQuote(ac.text)}`)
    const list = cites?.get(letter) ?? []
    if (!list.length) lines.push('  cite: []')
    else {
      lines.push('  cite:')
      for (const c of list) {
        lines.push(`    - kind: ${c.kind}`, `      path: ${c.path}`, `      symbol: ${c.symbol}`, `      sha: ${pin}`)
        if (c.note) lines.push(`      note: ${c.note}`)
      }
    }
    return lines.join('\n')
  }).join('\n')

  return `---\n${fmLines.join('\n')}\n---\n\n${sentence ? `${sentence}\n\n` : ''}## Acceptance criteria\n\n\`\`\`yaml\n${acBlocks}\n\`\`\`\n`
}

// ── ONE declaration / test-label matcher ────────────────────────────────────
// The cite-honesty rule made mechanical: `enforced` needs an exact-name
// DECLARATION in the cited file; `verified` needs the exact innermost
// `test('…')` / `testWidgets('…')` / `it('…')` label — never `group`, which
// these patterns simply cannot match. Returns the 1-based line, or 0.
const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function findDeclaration(content, symbol) {
  const sym = reEsc(symbol)
  const patterns = [
    new RegExp(`(?:^|\\s)(?:abstract\\s+class|final\\s+class|sealed\\s+class|base\\s+class|class|mixin|enum|extension|typedef|interface|struct|trait|protocol)\\s+${sym}\\b`),
    new RegExp(`(?:^|\\s)(?:function|def|fn|type|const|let|var|final)\\s+${sym}\\b`),
    // A typed declaration `Foo bar(` / `Foo bar =` — with call-site contexts
    // (`return Foo(…)`, `await Foo(…)`) excluded, because a false declaration
    // is worse than a dropped cite.
    new RegExp(`^\\s*(?:static\\s+|final\\s+|const\\s+|late\\s+)*(?!return\\b|throw\\b|await\\b|yield\\b|new\\b|case\\b|else\\b|if\\b|while\\b|for\\b|switch\\b)[A-Za-z_$][\\w$<>,?\\s]*?\\s+${sym}\\s*[(=]`),
  ]
  const lines = String(content).split('\n')
  for (let i = 0; i < lines.length; i++)
    for (const re of patterns) if (re.test(lines[i])) return i + 1
  return 0
}
export function findTestLabel(content, label) {
  const re = new RegExp(`\\b(?:test|testWidgets|it)\\s*\\(\\s*(['"])${reEsc(label)}\\1`)
  const lines = String(content).split('\n')
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1
  return 0
}

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

// ── the four spec-format families (SKA-026, D-01 variance survey) ───────────
// ONE parser, parameterized — never four parsers. Each family declares only
// what changes how the SAME bytes parse; everything else is shared. The
// S-rules (raw markers, no fabricated triples, verbatim consumes, quoted
// status voices) apply identically across families — no family weakens a rule.
//
//   reference   family 1 — owner, kiosk, stock, kds (kiosk/kds by construction)
//   greenfield  family 2 — driver, agent (no triple; Journey(s): integer index)
//   asbuilt     family 3 — storefront, garage (checkbox = as-built evidence;
//               exotic markers; wrapped headers; single-line triples)
//   legacyflat  family 4 — flutter-pos (no epic key in filenames; split
//               optional trailers; collapsed AC ranges; unlabeled checkboxes)
export const FAMILIES = {
  reference: {
    name: 'reference',
    filePattern: /^[A-Za-z]{2,}-\d{2}-.*\.md$/,
    epicKeyFrom: 'filename',
    markers: [' ', 'x', 'X'],   // a tick is recorded raw (S2); exotic markers refuse
    markerSuffix: false, continuations: false, unlabeledAcs: false,
    acRanges: false, singleLineTriple: false,
    tripleExpected: true, trailerExpected: true,
  },
  greenfield: {
    name: 'greenfield',
    filePattern: /^[A-Za-z]{2,}-\d{2}-.*\.md$/,
    epicKeyFrom: 'filename',
    markers: [' ', 'x', 'X'],
    markerSuffix: false, continuations: false, unlabeledAcs: false,
    acRanges: false, singleLineTriple: false,
    tripleExpected: false, trailerExpected: true,
  },
  asbuilt: {
    name: 'asbuilt',
    filePattern: /^[A-Za-z]{2,}-\d{2}-.*\.md$/,
    epicKeyFrom: 'filename',
    markers: null,              // any raw marker, incl. [~] and multi-codepoint [🟡]
    markerSuffix: true,         // `- [x] ✅ AC-1 — …` (garage GR-05)
    continuations: true, unlabeledAcs: false,
    acRanges: false, singleLineTriple: true,
    tripleExpected: false, trailerExpected: true,
  },
  legacyflat: {
    name: 'legacyflat',
    filePattern: /^\d{2}[a-z]?-.*\.md$/,
    epicKeyFrom: 'storyPrefix', // no epic key in ANY filename (D-01 axis 7)
    markers: [' ', 'x', 'X', '~'],
    markerSuffix: false, continuations: true, unlabeledAcs: true,
    acRanges: true, acTags: true,   // `AC-8 *(rebuild)* — …` italic label tags
    singleLineTriple: false,
    tripleExpected: false, trailerExpected: false,  // absent trailer = gap, not error
  },
}

// Strong per-file family signals, from the HEADER only (mid-document `>`
// callouts are never header evidence — D-01 axis 4). Used to VETO a declared
// family, never to guess: a signal contradicting the declaration is a REFUSAL
// naming both candidates.
export function detectFamilySignals(text) {
  const header = headerBlock(String(text).split('\n').map(l => l.replace(/\r$/, ''))).join('\n')
  const signals = []
  if (/\*\*Journeys?:\*\*/.test(header)) signals.push({ family: 'greenfield', why: 'header carries **Journey(s):** (integer journey index)' })
  if (/\*\*Last updated:\*\*/.test(header)) signals.push({ family: 'legacyflat', why: 'header carries **Last updated:** (flutter-pos five-field header)' })
  if (/\*\*Implementation synced:\*\*|\*\*Added:\*\*/.test(header)) signals.push({ family: 'asbuilt', why: 'header carries **Implementation synced:**/**Added:** (as-built audit lines)' })
  if (/\*\*Status:\*\*[^\n]*\*\*Story prefix:\*\*/.test(header.replace(/\n> (?!\*\*)/g, ' '))) signals.push({ family: 'asbuilt', why: 'Story prefix rides mid-line inside the Status value (storefront header)' })
  return signals
}

/** The FIRST contiguous blockquote block before the first `## ` line — the
 *  header, and nothing else. `>` callouts later in the file are content. */
function headerBlock(lines) {
  const out = []
  for (const l of lines) {
    if (/^##\s/.test(l)) break
    if (l.startsWith('>')) out.push(l)
    else if (out.length) break
  }
  return out
}

// Header fields can WRAP across physical lines and share lines (storefront
// SF-07; `Story prefix` at the END of the Status value). Join, then tokenize
// on `**Key:**` boundaries; ` · ` is the separator BETWEEN fields but also
// legal INSIDE a value, so values run to the next key, trimming a trailing
// separator.
function parseHeaderFields(headerLines) {
  const joined = headerLines.map(l => l.replace(/^>\s?/, '')).join(' ').replace(/\s+/g, ' ').trim()
  const fields = []
  const re = /\*\*([^*]+?):\*\*/g
  let m, marks = []
  while ((m = re.exec(joined))) marks.push({ key: m[1].trim(), start: m.index, end: m.index + m[0].length })
  for (let i = 0; i < marks.length; i++) {
    let value = joined.slice(marks[i].end, marks[i + 1]?.start ?? joined.length).trim()
    value = value.replace(/[·]\s*$/, '').trim()
    fields.push({ key: marks[i].key, value })
  }
  return fields
}

// ── ONE spec parser, family-parameterized ───────────────────────────────────
// Prepare emits FROM this parse; the fidelity gate compares AGAINST this parse
// (of the pinned `git show`) with the SAME family — a parser bug cannot pass
// its own output while failing the source. `opts.epicKey` scopes the story
// heading (`^### <KEY>-NN · `) so journey headings and README-style `###`
// lines can never be mistaken for stories (D-01 axis 8).
export function parseSpec(text, fam = FAMILIES.reference, opts = {}) {
  const lines = String(text).split('\n').map(l => l.replace(/\r$/, ''))
  const spec = { family: fam.name, title: null, tier: null, priority: null, storyPrefix: null, sections: [], stories: [], statusHeaderSeen: false, statusHeaderRaw: null, headerExtrasRaw: [] }
  let section = null, story = null, inStories = false, openAc = null

  const h1 = lines.find(l => /^#\s+\S/.test(l))
  if (h1) {
    const seg = h1.replace(/^#\s+/, '').split(' · ')
    // The number segment may carry a letter (`05b`, flutter-pos).
    spec.title = (seg.length >= 3 && /^\d+[a-z]?$/i.test(seg[1].trim())) ? seg.slice(2).join(' · ').trim() : seg.join(' · ').trim()
  }

  const CORE = new Set(['Tier', 'Priority', 'Status', 'Story prefix'])
  for (const f of parseHeaderFields(headerBlock(lines))) {
    if (f.key === 'Tier' && spec.tier == null) spec.tier = f.value
    else if (f.key === 'Priority' && spec.priority == null) spec.priority = f.value
    else if (f.key === 'Story prefix' && spec.storyPrefix == null) spec.storyPrefix = f.value.replace(/`/g, '').trim()
    else if (f.key === 'Status') { spec.statusHeaderSeen = true; spec.statusHeaderRaw ??= `**Status:** ${f.value}` }
    // S4 (A2): every header key beyond the core four — Consumes, Implements,
    // Journey(s), Last updated, Implementation synced, whatever a family
    // invents — captured VERBATIM, key + value. Mapping to project-layer keys
    // is promote-time work, never extraction-time normalization.
    else if (!CORE.has(f.key)) spec.headerExtrasRaw.push(`**${f.key}:** ${f.value}`)
  }

  // The story heading is keyed: `### <EPIC-KEY>-NN · Title`. Without an epic
  // key we accept any `<TOKEN>-NN` shape (golden/legacy callers).
  const keyEsc = opts.epicKey ? String(opts.epicKey).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '[A-Za-z]{2,}-\\d{2}[A-Za-z]?'
  const storyRe = new RegExp(`^###\\s+(${keyEsc}-\\d{2})\\s+·\\s+(.*?)\\s*$`)

  // AC grammar assembled from the family's parameters. Marker sets are
  // per-LINE capture, never per-file mode (garage mixes [x]/[~]/[🟡]).
  const markerCls = fam.markers ? `\\[(?:${fam.markers.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\]` : '\\[[^\\]]*\\]'
  const suffix = fam.markerSuffix ? '((?:\\s+(?!AC-\\d)\\S+)*)' : '()'
  const label = fam.acRanges ? '(AC-\\d+(?:[–-]AC-\\d+)?)' : '(AC-\\d+)'
  const tag = fam.acTags ? '(?:\\s+(\\*\\([^)]*\\)\\*))?' : '()'
  const acRe = new RegExp(`^-\\s+(${markerCls})${suffix}\\s+${label}${tag}\\s+—\\s+(.*?)\\s*$`)
  const unlabeledRe = fam.unlabeledAcs ? new RegExp(`^-\\s+(${markerCls})\\s+(?!AC-\\d)(.*?)\\s*$`) : null

  const endSection = () => {
    if (!section) return
    while (section.body.length && !section.body[0].trim()) section.body.shift()
    while (section.body.length && !section.body.at(-1).trim()) section.body.pop()
    spec.sections.push({ heading: section.heading, body: section.body.join('\n') })
    section = null
  }
  const endStory = () => { if (story) spec.stories.push(story); story = null; openAc = null }

  lines.forEach((l, idx) => {
    const h2 = l.match(/^##\s+(.*?)\s*$/)
    if (h2 && !l.startsWith('###')) {
      endStory(); endSection()
      // `## Stories` may carry a suffix (`## Stories (high-level — …)`,
      // flutter-pos) — anchor on the word, not the literal.
      inStories = /^Stories\b/.test(normWS(h2[1]))
      if (!inStories) section = { heading: h2[1], body: [] }
      return
    }
    // legacyflat: stories are not always fenced by `## Stories` — a keyed
    // story heading ANYWHERE outside a section opens the story stream.
    if (!inStories && !section && storyRe.test(l)) inStories = true
    if (inStories) {
      const h3 = l.match(storyRe)
      if (h3) { endStory(); story = { key: h3[1], title: h3[2], anchor: slug(l.replace(/^###\s+/, '')), article: null, persona: null, want: null, soThat: null, acs: [], priority: null, priorityCode: null, statusTrailerRaw: null, extrasRaw: [], context: null, uncarried: [], line: idx + 1 }; return }
      if (!story) return
      if (!l.trim()) { openAc = null; return }
      let m
      // The triple: three bold lines (reference), or one line (storefront),
      // or absent entirely (S3 — nothing is ever fabricated from absence).
      if (fam.singleLineTriple && (m = l.match(/^\*\*As (a|an|the)\*\*\s+(.+?)\s+\*\*I want\*\*\s+(.+?)(?:\s+\*\*So that\*\*\s+(.+?))?\s*$/))) {
        story.article = m[1]; story.persona = m[2]; story.want = m[3]; story.soThat = m[4] ?? null; return
      }
      if ((m = l.match(/^\*\*As (a|an|the)\*\*\s+(.*?)\s*$/))) { story.article = m[1]; story.persona = m[2]; return }
      if ((m = l.match(/^\*\*I want\*\*\s+(.*?)\s*$/))) { story.want = m[1]; return }
      if ((m = l.match(/^\*\*So that\*\*\s+(.*?)\s*$/))) { story.soThat = m[1]; return }
      // S2 (A2): the checkbox marker (and any suffix decoration like `✅`) is
      // captured RAW — recorded, never interpreted, never a filter.
      if ((m = l.match(acRe))) {
        const rangeM = m[3].match(/^AC-(\d+)[–-]AC-\d+$/)
        openAc = { n: Number(rangeM ? rangeM[1] : m[3].slice(3)), marker: (m[1] + (m[2] ?? '')).trim(), rangeRaw: rangeM ? m[3] : null, tagRaw: m[4] || null, text: m[5], line: idx + 1 }
        story.acs.push(openAc); return
      }
      if (unlabeledRe && (m = l.match(unlabeledRe)) && !/^\*\*/.test(m[2])) {
        openAc = { n: null, marker: m[1], rangeRaw: null, tagRaw: null, text: m[2], line: idx + 1 }
        story.acs.push(openAc); return
      }
      // Trailers: combined `**Priority:** Pn · **Status:** X`, or separate
      // optional lines (flutter-pos), or Status-only (storefront). The
      // priority VALUE is verbatim (`P0/P1`, `P2 (gates …)`); priorityCode is
      // the leading `P<d>` token for tags.
      if ((m = l.match(/^\*\*Priority:\*\*\s*(.*)$/))) {
        openAc = null
        const combined = m[1].match(/^(.*?)\s*·\s*\*\*Status:\*\*/)
        story.priority = (combined ? combined[1] : m[1]).trim()
        story.priorityCode = (story.priority.match(/^P\d[\w/]*/) ?? [null])[0]
        if (/\*\*Status:\*\*/.test(l)) story.statusTrailerRaw = l.trim()
        return
      }
      if ((m = l.match(/^\*\*Status:\*\*\s*(.*)$/))) { openAc = null; story.statusTrailerRaw = story.statusTrailerRaw ? `${story.statusTrailerRaw}\n${l.trim()}` : l.trim(); return }
      if ((m = l.match(/^\*\*Acceptance criteria\*\*/))) { openAc = null; return }
      // Other bold-label story lines (`**Implements:** US-…`) — S4 material,
      // captured verbatim per story.
      if ((m = l.match(/^\*\*([^*]+?):\*\*\s*(.*)$/))) { openAc = null; story.extrasRaw.push(`**${m[1]}:** ${m[2]}`.trim()); return }
      // Continuations: an open AC's text wraps (indented in storefront,
      // unindented in flutter-pos). Only while an AC is open; a blank line,
      // list item, heading, rule, or label closes it.
      if (fam.continuations && openAc && !/^\s*-\s/.test(l) && !/^#/.test(l) && l.trim() !== '---' && !l.startsWith('>')) {
        openAc.text += ' ' + l.trim(); return
      }
      if (l.trim() === '---') { openAc = null; return }
      // S3 (A2): first plain paragraph kept as PROVENANCE CONTEXT only —
      // never promoted to a fabricated story sentence. Everything else that
      // falls through is counted so prepare can report uncarried content.
      if (story.context == null && !l.startsWith('**') && !l.startsWith('-') && !l.startsWith('#') && !l.startsWith('>')) { story.context = l.trim(); return }
      story.uncarried.push({ line: idx + 1, text: l.trim() })
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
    // Heading-ish lines (real headings and bold pseudo-headings, decorated or
    // not — `**Acceptance criteria** *(POS-050 evidence…)*` counts) open or
    // close the AC span.
    if (/^#{1,6}\s/.test(l) || /^\*\*[^*]+\*\*/.test(l)) inAcSpan = /^(#{1,6}\s+|\*\*)acceptance criteria/i.test(l)
    const isItem = /^\s*-\s+\S/.test(l)
    if (!isItem) return
    const checkbox = /^\s*-\s+\[[^\]]{0,8}\]\s/.test(l)
    // An AC LABEL leads the item (optionally after a marker/decoration) and is
    // followed by a separator — a mid-text "…US-P08-06 AC-1…" mention in a
    // Dependencies/References bullet is a cross-reference, not an AC.
    const acLabel = /^\s*-\s+(?:\[[^\]]*\]\s+)?(?:\S{1,8}\s+)?AC-\d+(?:[–-]AC-\d+)?\s*[—–:-]/.test(l)
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
  const fm = [`key: ${epicKey}`, `title: ${spec.title}`, `app: ${app}`]
  // Tier/Priority are family facts, not universals (storefront has neither;
  // flutter-pos has no Tier) — absent in the spec means absent here, never an
  // empty lie. Values are VERBATIM, compound qualifiers included (`P0/P1`,
  // `MVP (car care + garage)`).
  if (spec.tier != null) fm.push(`tier: ${spec.tier}`)
  if (spec.priority != null) fm.push(`priority: ${spec.priority}`)
  // A3.1: the consumes-slot line, verbatim — after R1 deletes the spec files,
  // this frontmatter is the ONLY home of the epic's traceability line.
  const consumes = consumesOf(spec.headerExtrasRaw)
  if (consumes) fm.push(`consumes_raw: ${consumes}`)
  fm.push(`source: ${repoId}:${specRel}@${pin}`)
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
  // tags carry the leading `P<d>` token only; the verbatim trailer (with its
  // qualifiers and status voice) is quoted in findings.md by S5.
  fmLines.push(`tags: [${st.priorityCode ?? ''}]`, 'out_of_scope: []')
  // A3.1, story level: flutter-pos carries per-story `**Implements:** US-…`
  // lines — same traceability rule, same one-copy home.
  const stConsumes = consumesOf(st.extrasRaw ?? [])
  if (stConsumes) fmLines.push(`consumes_raw: ${stConsumes}`)
  fmLines.push(`source: ${repoId}:${specRel}#${st.anchor}@${pin}`)

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
    // S2: a non-default marker is data someone wrote — carried raw (suffix
    // decorations like `[x] ✅` included). The default `[ ]` is omitted so
    // the owner fixtures stay byte-stable.
    if (ac.marker && ac.marker !== '[ ]') lines.push(`  marker: ${yamlQuote(ac.marker)}`)
    // A collapsed range (`AC-1–AC-5`, flutter-pos) is ONE physical line and
    // stays one entry — the raw range recorded, the split into logical ACs a
    // promote-time decision, never a fabrication here.
    if (ac.rangeRaw) lines.push(`  range: ${yamlQuote(ac.rangeRaw)}`)
    // An italic label tag (`*(amended)*`, `*(superseded)*` — flutter-pos) is
    // an assertion about the AC, recorded raw beside it, never interpreted.
    if (ac.tagRaw) lines.push(`  tag: ${yamlQuote(ac.tagRaw)}`)
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

// ── the consumes slot (A3.1) ────────────────────────────────────────────────
// The traceability line that must survive R1 deletion: `Consumes:` /
// `Implements:` / `Journey(s):` header (and story-level) fields, carried
// VERBATIM into frontmatter — the one copy, in the record that outlives the
// spec files. Everything else in the header extras is audit metadata and goes
// to the findings status-voices block instead.
export const CONSUMES_SLOT = /^\*\*(Consumes|Implements|Journeys?):\*\*/
export const consumesOf = extras => extras.filter(x => CONSUMES_SLOT.test(x)).join(' · ')

// ── B2 (A4): conventions_files — expand `@`-includes, explicitly ────────────
// A newborn does not process CLAUDE.md's `@path` includes; anything a listed
// file pulls in is listed explicitly. readFn(path) → content or null.
// Deterministic order: each file before its includes, first-seen wins.
export function expandConventionIncludes(readFn, paths) {
  const files = [], missing = [], seen = new Set()
  const visit = p => {
    if (seen.has(p)) return
    seen.add(p)
    const content = readFn(p)
    if (content == null) { missing.push(p); return }
    files.push(p)
    for (const m of String(content).matchAll(/^@(\S+)\s*$/gm)) visit(m[1])
  }
  for (const p of paths) visit(p)
  return { files, missing }
}

// ── B3 (A4): the denylist DERIVED from the RULES denylist section ───────────
// Every backticked glob in the `## … denylist …` section body, in order,
// VERBATIM. An understated denylist is the profile lying about guardrails —
// the caller refuses on divergence rather than reviewing it.
export function denylistFromRules(text) {
  let inSection = false
  const globs = []
  for (const l of String(text).split('\n')) {
    const h = l.match(/^##+\s+(.*)$/)
    if (h) { inSection = /denylist/i.test(h[1]); continue }
    if (inSection) for (const m of l.matchAll(/`([^`]+)`/g)) globs.push(m[1])
  }
  return globs
}

// ── journeys as a walked tree (SKA-028, A5 ruling: option B) ────────────────
// One file per journey: frontmatter + VERBATIM narrative body. The body is
// the same kind of thing an epic section is — imported narrative that must
// survive byte-exact — so the fidelity gate keeps one shape across layers.
// journeys.yaml stays the index (keys/labels); the file is the record.

/** The `## ` section of `text` whose heading slugs to `anchor` (prefix match,
 *  same slugger both sides). Returns { heading, body, raw } — `raw` includes
 *  the heading line, trimmed of blank edges — or null. Used by the emitter
 *  AND the fidelity gate: one extractor, nowhere for a second copy to hide. */
export function sectionByAnchor(text, anchor) {
  const want = slug(anchor)
  const lines = String(text).split('\n').map(l => l.replace(/\r$/, ''))
  let start = -1, heading = null
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.*?)\s*$/)
    if (!m) continue
    if (start >= 0) {
      const body = lines.slice(start, i)
      return trimSection(heading, body)
    }
    const s = slug(m[1])
    if (s === want || s.startsWith(want)) { start = i; heading = m[1] }
  }
  if (start < 0) return null
  return trimSection(heading, lines.slice(start))
}
function trimSection(heading, bodyLines) {
  const b = [...bodyLines]
  while (b.length && !b.at(-1).trim()) b.pop()
  // A trailing `---` rule belongs to the document's typography, not the record.
  while (b.length && (b.at(-1).trim() === '---' || !b.at(-1).trim())) b.pop()
  return { heading, raw: b.join('\n') }
}

/** Read a `.sakal` collection file (journeys.yaml grammar) WITHOUT verify's
 *  error plumbing: `- KEY — label` entries + indented `field: value` lines. */
export function readCollection(text, collection) {
  const entries = []
  let current = null
  for (const rawLine of String(text).split('\n')) {
    const l = rawLine.replace(/\r$/, '')
    if (!l.trim() || l.trim().startsWith('#')) continue
    if (new RegExp(`^${collection}\\s*:\\s*$`).test(l)) continue
    const item = l.match(/^\s*-\s+(\S+)\s+—\s+(.*)$/)
    if (item) { current = { key: item[1], label: stripInlineComment(item[2]).trim(), fields: {} }; entries.push(current); continue }
    const sub = l.match(/^\s+([A-Za-z_]+)\s*:\s*(.*)$/)
    if (sub && current) current.fields[sub[1]] = unquote(stripInlineComment(sub[2]))
  }
  return entries
}

/** Journey record: frontmatter (key, title, goal, persona, source) + the
 *  VERBATIM section. `pin`/`repoId` null → resolvable-but-unpinnable source,
 *  exactly as stated in the emission report. */
export function renderJourneyDoc({ key, title, goal, persona, sourcePath, anchor, repoId, pin, body }) {
  const src = `${repoId ? `${repoId}:` : ''}${sourcePath}${anchor ? `#${anchor}` : ''}${pin ? `@${pin}` : ''}`
  const fm = [`key: ${key}`, `title: ${title}`, `goal: ${goal}`, `persona: ${persona}`, `source: ${src}`]
  return `---\n${fm.join('\n')}\n---\n\n${body}\n`
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

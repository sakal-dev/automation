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
import { readFileSync, existsSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'

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
        lines.push(`    - kind: ${c.kind}`)
        // symbol_kind sits next to kind because that is how it reads: what
        // KIND of proof, then what kind of THING the symbol names.
        if (c.symbol_kind) lines.push(`      symbol_kind: ${c.symbol_kind}`)
        lines.push(`      path: ${c.path}`, `      symbol: ${c.symbol}`)
        if (c.count != null && c.count !== '') lines.push(`      count: ${c.count}`, `      count_pattern: ${yamlQuote(String(c.count_pattern ?? ''))}`)
        // A cross-repo cite carries the OWNING repo's sha (A13). `c.sha ?? pin`
        // keeps every same-repo cite byte-identical to 0.17.0's output.
        lines.push(`      sha: ${c.sha ?? pin}`)
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

/** Value-reader for a story record's fenced-yaml AC block: ids in order,
 *  raw markers/ranges/tags, unquoted text, cite tuples. (Verify keeps its own
 *  line-numbered walk for error reporting; this is the VALUES view shared by
 *  the baseline and any other consumer that needs what a record says.) */
export function readFencedACs(text) {
  const acs = []
  let inYaml = false, ac = null, cite = null
  for (const raw of String(text).split('\n')) {
    if (/^```yaml\s*$/.test(raw.trim())) { inYaml = true; continue }
    if (/^```\s*$/.test(raw.trim())) { inYaml = false; ac = null; cite = null; continue }
    if (!inYaml) continue
    let m
    if ((m = raw.match(/^-\s+ac:\s*(\S+)\s*$/))) { ac = { id: m[1], marker: null, range: null, tag: null, text: null, cites: [] }; acs.push(ac); cite = null; continue }
    if (!ac) continue
    if ((m = raw.match(/^\s+marker:\s*(.*)$/))) { ac.marker = yamlUnquote(m[1]); continue }
    if ((m = raw.match(/^\s+range:\s*(.*)$/))) { ac.range = yamlUnquote(m[1]); continue }
    if ((m = raw.match(/^\s+tag:\s*(.*)$/))) { ac.tag = yamlUnquote(m[1]); continue }
    if ((m = raw.match(/^\s+text:\s*(.*)$/))) { ac.text = yamlUnquote(m[1]); continue }
    if ((m = raw.match(/^\s+-\s+kind:\s*(\S+)\s*$/))) { cite = { kind: m[1] }; ac.cites.push(cite); continue }
    if (cite && (m = raw.match(new RegExp(`^\\s+(${CITE_FIELDS.join('|')}):\\s*(.*)$`)))) { cite[m[1]] = yamlUnquote(m[2]); continue }
  }
  return acs
}

/** Every field a cite entry may carry. ONE list — verify refuses anything
 *  outside it (an unknown field is a typo that would otherwise be dropped in
 *  silence), prepare carries exactly these forward, and readFencedACs reads
 *  them. `symbol_kind`/`count`/`count_pattern` are the 0.18 additions. */
export const CITE_FIELDS = ['path', 'symbol', 'sha', 'note', 'symbol_kind', 'count', 'count_pattern']

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
  const lines = String(content).split('\n')
  const esc = reEsc(label)
  // Pest / Dart / Jest style: the label is a STRING argument.
  const re = new RegExp(`\\b(?:test|testWidgets|it)\\s*\\(\\s*(['"])${esc}\\1`)
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1
  // PHPUnit method style (0.18). `public function test_foo()` is a test label
  // in every sense that matters — it is what the runner prints and what a
  // human greps for — but only findDeclaration ever matched it, which forced
  // eleven citation waves to file test evidence under `kind: enforced` with
  // an apologetic note. A method NOT named test* counts only when it is
  // annotated as a test (`#[Test]`, `@test`), which is PHPUnit's own rule.
  const method = new RegExp(`\\bfunction\\s+${esc}\\s*\\(`)
  const ATTR = /#\[\s*(?:[\w\\]+\\)?Test\s*[\]\(]/
  const DOC = /@test\b/
  for (let i = 0; i < lines.length; i++) {
    if (!method.test(lines[i])) continue
    if (/^test/.test(label)) return i + 1
    // The annotation must be ATTACHED to this method: walk up through blank
    // lines, attributes and docblock lines only, and stop at the first line
    // of real code. A fixed n-line window would let the PREVIOUS method's
    // `#[Test]` bless the helper below it — which is a false positive, and a
    // false positive in a citation is a lie with a line number.
    for (let j = i - 1; j >= 0; j--) {
      const t = lines[j].trim()
      if (!t) continue
      if (!/^(#\[|\/\*|\*|\/\/)/.test(t)) break
      if (ATTR.test(t) || DOC.test(t)) return i + 1
    }
  }
  return 0
}

// ═════════════════════════════════════════════════════════════════════════════
// THE CITATION GRAMMAR (0.18 — F1)
//
// `kind:` still carries the PROOF semantics and still has exactly two values:
//   enforced — the CODE DECLARES this thing
//   verified — a TEST ASSERTS this thing
// That split is the linter's authority and it does not move.
//
// `symbol_kind:` is a new OPTIONAL discriminator saying what KIND of thing
// `symbol:` names, so the matcher knows what to look for. Absent, it is
// `declaration` for enforced and `test` for verified — byte-identical to
// 0.17.0, which is what keeps eleven trees of existing citations verifying
// unchanged. Explicit beats clever here: a dotted `a.b.c` symbol could be a
// route name OR a config key, and guessing between them is exactly the kind
// of silent wrong answer a citation must never give.
// ═════════════════════════════════════════════════════════════════════════════
export const SYMBOL_KINDS = new Set(['declaration', 'test', 'route', 'config', 'view', 'enum_case', 'measured'])
export const defaultSymbolKind = kind => (kind === 'verified' ? 'test' : 'declaration')
/** Which `kind:` each symbol_kind is legal under. A route, config key, view
 *  or enum case is something the code DECLARES; a test label is something a
 *  test ASSERTS. Crossing them is a lint error, never a silent pass. */
export const SYMBOL_KIND_PROOF = {
  declaration: 'enforced', route: 'enforced', config: 'enforced',
  view: 'enforced', enum_case: 'enforced', measured: 'enforced', test: 'verified',
}

// ── route names ─────────────────────────────────────────────────────────────
// `api.order.v1.admin.orders.index` is assembled by Laravel from group name
// PREFIXES plus a leaf `->name()`, so the full string very often appears
// nowhere in the file. Grepping the literal and stopping there would fail
// most real routes; inventing a route table would need a PHP interpreter.
// Middle path: collect every route-name literal the file declares, accept an
// exact hit, and otherwise accept a COMPOSITION of declared dot-terminated
// prefixes that reconstructs the name exactly. A composition proves every
// piece is declared in that file — weaker than an exact hit, so callers are
// told (verify prints CITECOMPOSED) rather than left to assume.
const ROUTE_LITERALS = [
  /(?:->|Route\s*::)\s*name\s*\(\s*(['"])([^'"]*)\1/g,
  /(['"])as\1\s*=>\s*(['"])([^'"]*)\2/g,
]
export function routeNameLiterals(content) {
  const out = new Map()
  String(content).split('\n').forEach((raw, i) => {
    for (const src of ROUTE_LITERALS) {
      const re = new RegExp(src.source, 'g')
      let m
      while ((m = re.exec(raw))) { const name = m[m.length - 1]; if (!out.has(name)) out.set(name, i + 1) }
    }
  })
  return out
}
export function findRouteName(content, name) {
  const decls = routeNameLiterals(content)
  if (decls.has(name)) return { line: decls.get(name), parts: [name] }
  const prefixes = [...decls.keys()].filter(k => k.endsWith('.') && k.length)
  const seen = new Set()
  const compose = (rest, depth) => {
    if (decls.has(rest)) return [rest]
    if (depth >= 4 || seen.has(rest)) return null
    seen.add(rest)
    for (const p of prefixes) {
      if (!rest.startsWith(p) || p.length >= rest.length) continue
      const tail = compose(rest.slice(p.length), depth + 1)
      if (tail) return [p, ...tail]
    }
    return null
  }
  const parts = compose(String(name), 0)
  if (parts) return { line: decls.get(parts[0]), parts, composed: true }
  return { line: 0, known: [...decls.keys()] }
}

// ── config keys ─────────────────────────────────────────────────────────────
// A config key is a path through a nested PHP array literal, so a regex over
// the leaf name would happily match `'enabled'` under any other branch. This
// walks the file's bracket structure and builds the real dotted paths, which
// is the difference between "a key by that name exists somewhere" and "THIS
// key exists".
export function configKeyPaths(content) {
  const text = String(content)
  const out = new Map()
  const frames = []                        // { array: bool, key: string|null }
  let line = 1, pendingKey = null
  const dotted = k => [...frames.filter(fr => fr.array && fr.key).map(fr => fr.key), k].join('.')
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\n') { line++; continue }
    if (ch === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; line++; continue }
    if (ch === '#') { while (i < text.length && text[i] !== '\n') i++; line++; continue }
    if (ch === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2)
      line += (text.slice(i, e < 0 ? text.length : e).match(/\n/g) || []).length
      i = e < 0 ? text.length : e + 1; continue
    }
    if (ch === "'" || ch === '"') {
      const q = ch, startLine = line
      let j = i + 1, s = ''
      while (j < text.length && text[j] !== q) {
        if (text[j] === '\\') { s += text[j + 1] ?? ''; j += 2; continue }
        if (text[j] === '\n') line++
        s += text[j]; j++
      }
      i = j
      if (/^\s*=>/.test(text.slice(j + 1))) { if (!out.has(dotted(s))) out.set(dotted(s), startLine); pendingKey = s }
      continue
    }
    if (ch === '[') { frames.push({ array: true, key: pendingKey }); pendingKey = null; continue }
    if (ch === '(') {
      const isArray = /\barray\s*$/.test(text.slice(Math.max(0, i - 10), i))
      frames.push({ array: isArray, key: isArray ? pendingKey : null })
      pendingKey = null; continue
    }
    if (ch === ']' || ch === ')') { frames.pop(); pendingKey = null; continue }
    if (ch === ',' || ch === ';') { pendingKey = null; continue }
  }
  return out
}
export function findConfigKey(content, key, path = '') {
  const paths = configKeyPaths(content)
  if (paths.has(key)) return { line: paths.get(key) }
  // Laravel's file-name segment: `config/order.php` holds `order.*`, and a
  // cite may or may not carry that first segment. Both readings are accepted,
  // and only both failing is a miss.
  const base = String(path).split('/').pop().replace(/\.php$/i, '')
  const segs = String(key).split('.')
  if (base && segs.length > 1 && segs[0] === base) {
    const trimmed = segs.slice(1).join('.')
    if (paths.has(trimmed)) return { line: paths.get(trimmed), trimmed }
  }
  if (base && paths.has(`${base}.${key}`)) return { line: paths.get(`${base}.${key}`) }
  return { line: 0, known: [...paths.keys()] }
}

// ── blade / template view names ─────────────────────────────────────────────
// A view name is a FILE PATH in disguise: `pos::receipts.duplicate` is
// `…/receipts/duplicate.blade.php`. There is no declaration to grep, so the
// proof is that the cited path IS the file the name resolves to — the cite's
// own `path:` is the evidence, and the match is that the two agree.
export function viewNameTail(name) {
  const bare = String(name).includes('::') ? String(name).split('::').slice(1).join('::') : String(name)
  return bare.replace(/\./g, '/')
}
export function findViewName(path, name) {
  const want = viewNameTail(name)
  const p = String(path).replace(/\\/g, '/')
  const re = new RegExp(`(?:^|/)${reEsc(want)}\\.(?:blade\\.php|php|twig|vue|html)$`)
  if (re.test(p)) return { line: 1, want }
  return { line: 0, want: `${want}.blade.php` }
}

// ── enum cases ──────────────────────────────────────────────────────────────
// `case Grace = 'grace';` is a declaration in every language sense, and
// findDeclaration cannot reach it: `case` sits in its own negative-lookahead
// list precisely so a switch arm never counts as a declaration. Given
// `Type::Case`, the enum declaration must be in the same file too — which is
// what stops `Grace` matching some unrelated enum that happens to share a
// member name.
export function findEnumCase(content, symbol) {
  const parts = String(symbol).split('::')
  const caseName = parts.length > 1 ? parts[1] : parts[0]
  const typeName = parts.length > 1 ? parts[0] : null
  const text = String(content), lines = text.split('\n')
  if (typeName) {
    const decl = new RegExp(`(?:^|\\s)(?:enum|class)\\s+${reEsc(typeName)}\\b`)
    if (!lines.some(l => decl.test(l))) return { line: 0, why: `no \`enum ${typeName}\` declared here` }
  }
  const php = new RegExp(`^\\s*case\\s+${reEsc(caseName)}\\s*(?:=|;|$)`)
  for (let i = 0; i < lines.length; i++) if (php.test(lines[i])) return { line: i + 1 }
  // Dart / TS-style enum bodies, whose members are bare identifiers.
  const enumRe = typeName ? new RegExp(`\\benum\\s+${reEsc(typeName)}\\b`) : /\benum\s+\w+/
  const m = enumRe.exec(text)
  if (m) {
    const open = text.indexOf('{', m.index)
    if (open >= 0) {
      let depth = 0, close = -1
      for (let i = open; i < text.length; i++) {
        if (text[i] === '{') depth++
        else if (text[i] === '}') { depth--; if (!depth) { close = i; break } }
      }
      const body = text.slice(open, close < 0 ? text.length : close)
      if (new RegExp(`(?:^|[{,\\s])${reEsc(caseName)}\\s*(?:[,;}(=]|$)`, 'm').test(body))
        return { line: text.slice(0, open).split('\n').length }
    }
  }
  return { line: 0, why: `no \`case ${caseName}\` (or enum member) here` }
}

// ── measured facts ──────────────────────────────────────────────────────────
// The AC whose truth is a COUNT — "89 permission cases", "20 epic files".
// 0.17.0's convention parked the figure in a `note:`, where nothing could
// ever re-check it, which is drift with a paper trail. A measured cite names
// the pattern and the number, and verify re-counts both at the pin: add a
// permission and the AC goes red, which is the entire point of a citation.
export function measureCount(items, patternSrc) {
  let re
  try { re = new RegExp(patternSrc) } catch (e) { return { error: `count_pattern is not a valid regex: ${e.message}` } }
  return { n: items.filter(s => re.test(s)).length }
}

// ── A13: the cross-repo seam, as path rules both scripts obey ───────────────
// One rule, one place. The moment prepare and verify disagree about where a
// tree lives, prepare emits citations verify cannot resolve — SKA-024 again,
// with evidence instead of anchors.

/** `<tree-key>:<path>` — the cross-repo citation form. A plain path (and a
 *  `../sibling/…` path) is deliberately NOT this: only a bare key followed by
 *  a colon qualifies, so nothing that verifies today changes meaning. */
export function parseTreePath(p) {
  const m = String(p ?? '').match(/^([A-Za-z0-9][A-Za-z0-9._-]*):(.+)$/)
  return m ? { tree: m[1], path: m[2] } : null
}

/** Where this tree's trees map lives: its own registry under scope: project,
 *  the spec-home's under scope: app when `project_layer:` is declared.
 *  Returns { file, ownerRoot, projectLayerDir } — file may be null. */
export function treesFileFor({ root, dirAbs, cfg }) {
  const scope = cfg?.scope?.value ?? cfg?.scope ?? ''
  const pl = cfg?.project_layer?.value ?? cfg?.project_layer ?? null
  if (scope !== 'app') return { file: join(dirAbs, 'registry/trees.yaml'), ownerRoot: join(dirAbs, '..'), projectLayerDir: dirAbs }
  if (!pl) return { file: null, ownerRoot: null, projectLayerDir: null }
  const dir = isAbsolute(pl) ? pl : join(root, pl)
  return { file: join(dir, 'registry/trees.yaml'), ownerRoot: join(dir, '..'), projectLayerDir: dir }
}

/** Read a trees map into `key -> { key, treeAbs, root, repo }`. Labels are
 *  paths to a `.sakal/` DIRECTORY, relative to the repo root that owns the
 *  map; a tree's repo root is that directory's parent. */
export function readTreesMap(file, ownerRoot) {
  const map = new Map()
  if (!file || !existsSync(file)) return map
  for (const e of readCollection(readFileSync(file, 'utf8'), 'trees')) {
    const label = (e.label ?? '').trim()
    if (!label) continue
    const treeAbs = isAbsolute(label) ? label : join(ownerRoot, label)
    map.set(e.key, { key: e.key, treeAbs, root: join(treeAbs, '..'), repo: e.fields?.repo ?? null })
  }
  return map
}

/** ONE dispatcher, shared by the writer and the checker (SKA-024's rule).
 *  `content` is the resolved file text; `entries` is a directory listing when
 *  the cited path IS a directory. Returns `{ ok, line, why, … }` — never a
 *  bare boolean, because the caller has to be able to say WHY it failed. */
export function matchCitation(c, { content = null, entries = null, path = '' } = {}) {
  const sk = c.symbol_kind || defaultSymbolKind(c.kind)
  if (!SYMBOL_KINDS.has(sk))
    return { ok: false, why: `symbol_kind "${sk}" is not one of ${[...SYMBOL_KINDS].join(', ')}` }
  if (SYMBOL_KIND_PROOF[sk] !== c.kind)
    return { ok: false, why: `symbol_kind "${sk}" belongs under kind: ${SYMBOL_KIND_PROOF[sk]}, not kind: ${c.kind}` }
  switch (sk) {
    case 'declaration': {
      const line = findDeclaration(content ?? '', c.symbol)
      return line ? { ok: true, line } : { ok: false, why: `no declaration of "${c.symbol}" greps in ${path}` }
    }
    case 'test': {
      const line = findTestLabel(content ?? '', c.symbol)
      return line ? { ok: true, line }
        : { ok: false, why: `no test label "${c.symbol}" greps in ${path} — a Pest/Dart \`test(…)\`/\`it(…)\` label, or a PHPUnit \`function ${c.symbol}(\` (test-prefixed, or #[Test]/@test annotated)` }
    }
    case 'route': {
      const r = findRouteName(content ?? '', c.symbol)
      if (!r.line) return { ok: false, why: `no route named "${c.symbol}" is declared in ${path}${r.known?.length ? ` — names found: ${r.known.slice(0, 5).join(', ')}${r.known.length > 5 ? '…' : ''}` : ' (the file declares no route names at all)'}` }
      return { ok: true, line: r.line, composed: r.composed ? r.parts : null }
    }
    case 'config': {
      const r = findConfigKey(content ?? '', c.symbol, path)
      if (!r.line) return { ok: false, why: `config key "${c.symbol}" is not a key path in ${path}${r.known?.length ? ` — keys found: ${r.known.slice(0, 6).join(', ')}${r.known.length > 6 ? '…' : ''}` : ' (no `key =>` pairs found at all)'}` }
      return { ok: true, line: r.line }
    }
    case 'view': {
      const r = findViewName(path, c.symbol)
      if (!r.line) return { ok: false, why: `view "${c.symbol}" resolves to …/${r.want}, which is not the cited path ${path}` }
      return { ok: true, line: 1 }
    }
    case 'enum_case': {
      const r = findEnumCase(content ?? '', c.symbol)
      if (!r.line) return { ok: false, why: `${r.why} in ${path} (cited as enum case "${c.symbol}")` }
      return { ok: true, line: r.line }
    }
    case 'measured': {
      const want = Number(c.count)
      if (!Number.isInteger(want) || want < 0) return { ok: false, why: `\`count: ${c.count}\` is not a non-negative integer` }
      const items = entries ?? String(content ?? '').split('\n')
      const got = measureCount(items, c.count_pattern)
      if (got.error) return { ok: false, why: got.error }
      if (got.n !== want)
        return { ok: false, why: `measured ${got.n} ${entries ? 'entries' : 'lines'} matching /${c.count_pattern}/ in ${path}, but the cite claims ${want} — the figure drifted, which is exactly what a measured cite exists to catch` }
      return { ok: true, line: 1, measured: got.n }
    }
  }
  return { ok: false, why: `unhandled symbol_kind "${sk}"` }
}

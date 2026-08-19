# The house schema

**Operator-reviewable. Expect this to be tuned.** It exists because a fleet of
repos each inventing its own dialect is unusable — you cannot compare eleven
projects whose "epic" means eleven different sizes.

Verify enforces the **mechanical** parts of this page as **warnings** in this
release, deliberately. Enforcing new conventions against trees that were drafted
before they existed would turn working directories red overnight. Normalise the
fleet first; flip these to errors when it is done.

Everything else here is style that prepare follows and a human judges.

---

## Journey vs module vs epic — the distinction people get wrong

- **Journey** — an end-to-end path *a person walks*, named as an outcome for
  them. "Save something before you lose it." If it does not describe someone
  getting somewhere, it is not a journey.
- **Module** — a *business capability*, not a codebase and not a screen.
  "Payments", "search". Modules are how you slice the product for ownership;
  they cut across journeys.
- **Epic** — an *outcome worth shipping*, inside a journey. It is the unit you
  would put on a roadmap and feel comfortable saying "done" about.

A journey that is really a feature, or an epic that is really a module, is the
most common drafting error. If two of them would have the same title, one of
them is misclassified.

## Granularity — the bounds verify checks

| Level | Expect | Warn beyond |
|---|---|---|
| stories per epic | 2–12 | >12 (the epic is really a journey, or two epics) |
| ACs per story | 1–8 | >8 (the story is doing two jobs) |
| words per AC | 4–30 | >30 (it is a paragraph, not a claim) |

Bounds are a smell test, not a law. A 13-story epic that is genuinely one
outcome is fine — the warning asks you to look, not to split.

## Keys and slugs

- Journey `XX-Jn` · Epic `XX-nn` · Story `XX-nn-mm` · AC `AC-nn` (zero-padded).
- `XX` is the project prefix, stable forever. Keys are **identity** — every
  cross-reference (story → epic, journey, persona) resolves by key, so
  renaming one breaks every file that points at it. Change titles freely;
  change keys almost never.
- Registry keys (persona, module, goal, app) are lower-kebab: `bay-tech`,
  `pos-core`. They read as words, not codes, because humans pick them from lists.

## Story shape

One sentence, one grammar:

> As a **&lt;persona&gt;**, I want **&lt;capability&gt;**, so that **&lt;benefit&gt;**.

The persona must be a real persona key, not a role invented for the sentence.
"So that" is not decoration — a story whose benefit you cannot write is usually
a task wearing a story's clothes.

## AC shape and voice

- **One testable claim.** If it contains "and", check whether it is two.
- **Present tense, observable.** "The share sheet lists the app" — not "the app
  should be listed", not "the user can see that it works".
- **No vague words.** appropriate · properly · correctly · fast · intuitive ·
  robust · seamless · various · as needed. Verify warns on these because none of
  them can be checked by anyone.
- **No status.** Not `[x]`, not "done", not "already built". A spec's checkbox
  is a claim; the verifier decides.
- **No welded evidence.** `AC-03 — syncs later, see sync_service.dart::flush`
  mixes the claim with its proof. Imported as-is by ruling — someone chose those
  words — but flagged every run, because a citation is where evidence belongs.
- **`kind`** — one of `behaviour` `constraint` `data` `ux` `security`
  `performance`. *This set is proposed, not ruled. It has been required since
  SKA-017 on my authority alone; if it is wrong, change it here.*

## GitHub issues — bug or task

- **Bug** — behaviour deviates from something already promised. It falsifies an
  AC, and it should be attached to that AC.
- **Task** — work to be done that no AC yet promises, or the implementation of
  one.
- An issue that is really a question or a discussion is neither. Leave it.

## Provenance

Every story and every AC carries `source:`.

- `source: docs/specs/GR-11.md#gr-11-01` — the document that justifies it. The
  anchor is matched by prefix, so improving a heading does not break it.
- `source: none (drafted)` — you wrote it and the repo does not say it. Legitimate
  and visible. Never omit the field to hide this.
- A source pointing at a document that no longer exists is an **error**, not a
  warning: it looks like evidence and is not.

## Imported vs authored — the precedence rule (SKA-025, ruled)

A re-extracted tree carries two kinds of text, and two different laws apply:

- **Imports** — AC `text`, raw `marker` fields, epic sections. **Fidelity
  wins.** They are the spec VERBATIM (normalised whitespace only), pinned to a
  sha, and the verify fidelity gate holds them to it. The house voice rules
  (vague words, length, welded evidence) do **not** run on imported AC text — a
  verbatim AC is never "improved" to satisfy a lint, or the two gates deadlock.
  Welded evidence inside imported text is the spec author's choice; it belongs
  in findings, not in an edit.
- **Authored** — the story sentence, titles, keys, everything prepare writes in
  its own voice. **Conventions govern.** The story-sentence grammar, key
  shapes, and granularity bounds above apply in full. A spec family with no
  story triple gets an EMPTY story field and a warning naming the human work —
  prepare never fabricates a voice (fabrication is worse than absence).

## AC-less stories (SKA-027, ruled)

In an **imported (source-pinned) tree**, a story with no acceptance criteria
is honest state — the spec has not defined them yet. Verify **warns**, never
errors, and the brief must say "no ACs — define them first". In a
**hand-authored tree** (no pin), no ACs stays an **error**: there, the
absence means nobody wrote the promise.

A key rename or story split is worth a decision record in `decisions.md`
naming why — every cross-reference resolves by key, so a rename is a break,
not a rename, for anything that points at the old one.

## What is NOT in scope for a convention

Whether an AC is the *right* AC. Whether an epic is worth shipping. Whether a
journey is one a real person actually walks. No linter should pretend to judge
these, and this page does not.

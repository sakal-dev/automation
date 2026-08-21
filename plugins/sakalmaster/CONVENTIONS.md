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

## The citation grammar (0.18)

A cite has two fields that decide what verify looks for.

**`kind:`** carries the PROOF, and still has exactly two values. This is the
one people get backwards from English intuition — follow the linter, not the
word:

- **`enforced`** — the CODE DECLARES this thing.
- **`verified`** — a TEST ASSERTS this thing.

**`symbol_kind:`** is optional and says what KIND of thing `symbol:` names, so
the matcher knows what to look for. Omit it and you get the 0.17.0 behaviour
exactly: `declaration` under `enforced`, `test` under `verified`. Every cite
written before 0.18 keeps its meaning, unchanged.

| `symbol_kind` | under | `symbol:` is | proven by |
|---|---|---|---|
| `declaration` *(default)* | enforced | a code symbol | an exact-name declaration in the cited file |
| `test` *(default)* | verified | a test label | a Pest/Dart `test(…)`/`it(…)` label, **or** a PHPUnit `test_*` method (or one annotated `#[Test]`/`@test`) |
| `route` | enforced | a route name | the `->name(…)` / `'as' => …` literals in the cited route file |
| `config` | enforced | a dotted config key | that full KEY PATH through the cited config file's array |
| `view` | enforced | a template name | the cited path BEING the file the name resolves to |
| `enum_case` | enforced | `Type::Case` or `Case` | `case <Name>` in the cited file (plus the enum's own declaration when you write the type) |
| `measured` | enforced | what was counted | re-counting `count_pattern` and getting `count` |

Crossing them — `symbol_kind: test` under `enforced`, `symbol_kind: route`
under `verified` — is a `CITEKIND` error, not a shrug.

Two things worth knowing before you use them:

- **A route name is often composed.** Laravel assembles
  `api.order.v1.admin.orders.index` from group prefixes plus a leaf `->name()`,
  so the whole string appears nowhere. Verify accepts a composition of declared
  prefixes and reports `CITECOMPOSED` when it used one. That is *weaker* than an
  exact hit: it proves every piece is declared in that file, not that Laravel
  composes them in that order. Fine for one grouped route file; look twice if
  the pieces come from unrelated groups.
- **A config key is a PATH, not a name.** `order.tax.enabled` matches only the
  `enabled` under `tax`, never some other `'enabled' =>` elsewhere in the file.
  Laravel's file-name segment (`config/order.php` → `order.*`) may be included
  or left off; both read the same.

## Measured ACs — the true-but-uncitable statistic

An AC whose truth is a COUNT ("89 permission cases", "20 epic files") has no
declaration that IS the count. Before 0.18 the convention parked the figure in
a `note:`, where nothing could ever re-check it — drift with a paper trail.

Cite it as a measurement instead:

```yaml
    - kind: enforced
      symbol_kind: measured
      path: app/Enums/PermissionEnum.php
      symbol: PermissionEnum
      count: 89
      count_pattern: "^\\s*case "
      sha: a1bb9b6
```

`count_pattern` is a regex matched **per line** of the cited file — or per
**entry name** when `path` is a directory, which is how you count files. Verify
re-counts at the pin every run: add a permission and the AC goes red, which is
the entire point of a citation. Both fields are required; a figure with no
method is a note, not a citation.

## Cross-repo evidence — the trees map

An AC proven by code in a sibling repo is cited through the **trees map**, a
project-layer file (`registry/trees.yaml`) naming each repo's `.sakal/` tree:

```yaml
trees:
  - order-module — ../pos-laravel/modules/Order/.sakal
    repo: sakal-dev/sakal
```

An app tree reaches it by declaring `project_layer: ../<spec-home>/.sakal` in
its own `config.yaml`. Then:

- **Cite it as `path: <tree-key>:<path-inside-that-repo>`,** with `sha:` set to
  *that repo's own* commit. Verify resolves the pin **inside that repo's git**,
  so a cross-repo citation is checked like any other — it no longer falls
  through to the working tree and reports `PINMISS` by construction, and it is
  no longer a hard `CITEGONE`.
- A tree key that is not in the map is an `XTREE` **error**. There is no quiet
  path: an unresolvable cross-repo cite fails loudly or it is not a cite.
- A `../sibling/…` relative path still means what it always meant (resolved
  from this repo root, pin unresolvable, `PINMISS`) — only a bare `key:` prefix
  is cross-repo.

With `project_layer:` declared, a `scope: app` tree's references to project-layer
keys (`epic`, `journey`, `persona`, `module`, and its own `app`) are checked
against the spec-home for the first time. They are **warnings** (`XREF`) by
default, for the same reason the granularity bounds are: a check that did not
exist while eleven trees were being written does not get to turn them red on
arrival. `--strict-xref` promotes them to errors once a tree is normalised.

A retired epic points at where it went instead of describing it in prose:
`superseded_by: <tree-key>[:<EPIC-KEY>]` on the `epics.yaml` row is resolved
through the map every run — the tree must be declared and the epic doc must
exist there. A row that resolves reports `RETIRED` (info) instead of `DRAFTED`,
because it did not vanish, it moved.

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

# Golden suite — provenance

Inputs are SNAPSHOTS of real spec files (never hand-written miniatures);
expected outputs are machinery-generated and human-reviewed (R3: no
hand-written trees). Runner: `node golden.test.mjs`.

| inputs/ | repo | pinned at | family |
|---|---|---|---|
| owner/ | sakal-dev/sakalpos-owner | `1e272bc` | reference (the A1 fixture pair) |
| stock/ | stock-flutter | `8139866` | reference (Consumes/Implements mix, decorated Priority) |
| agent/ | agent-flutter | `bcc0fc1` | greenfield (no triple, Journey(s) integer index, AG-13 missing field) |
| storefront/ | storefront-flutter | `b60b460` | asbuilt (checked ACs, no Priority, wrapped header, status-in-title) |
| garage/ | garage-flutter | `523e808` | asbuilt (`[~]`/`[🟡]`/`✅`-suffix markers, 4–5-line header, compound values) |
| flutter-pos/ | Business/specs/implementations/flutter-pos (NOT a git repo — placeholder pin `fp00000`) | — | legacyflat (no key in filenames, `05b`→`FP-05B`, collapsed ranges, label tags, unlabeled checkboxes, split/absent trailers) |

kiosk and kds are family 1 with field renames only — every axis they carry is
exercised by the stock cases; they are covered by construction.

The 5-header/4-cell defect tables (kiosk/stock/owner READMEs) are never
parsed: README files are excluded from discovery and no field is ever derived
from a table (asserted in the runner).

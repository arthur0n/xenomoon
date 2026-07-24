<!-- GENERATED from LEDGER.json by `npm run ledger` — DO NOT EDIT; edit LEDGER.json. (No regen script exists in this fork yet — this view was hand-synced 2026-07-24; see parking.) -->

# Framework audit ledger

**open (fix-now): 1 · later: 3 · skip: 0**

_Last audit:_ 2026-07-24 (recalibration) — D7-ledger-godot-stale + D7-suite-godot-stale APPLIED: pruned the 10 godot-world rows (their spine is absent from this fork) and re-authored the suite to the fork spine; kept the 2 rows that still apply (caveman-gate, result-contract). Earlier same day: domain-fork reality check. PRIOR: 2026-07-08 — full 9-dim fan-out pass.

> Source of truth is **`LEDGER.json`** — edit that, then `npm run ledger` (pre-commit also regenerates). This file + `ledger.html` are generated views. Applied findings are DELETED (git is the fix record), never stamped.

## Bucket 3 — no-brainers (0) · fix-now · mechanical (framework-nobrainer-fixer)

_none_

## Bucket 4 — improvements (1) · fix-now · needs judgment (/framework-audit-fix)

- **D7-contribute-two-tree** · `D7` · _open_ — plugin/commands/contribute.md (SHIPPED) is still built on the dead two-tree model: it stages domains/<name>/plugin/{skills,library}/ and its scope-safety rule forbids staging plugin/ (CORE) — but promote-run.js locate() lands promotions in plugin/{skills,library}/ (one tree). Needs a redesign (provenance by git history / promotions board, not path), not a path fix. Found 2026-07-24.

## Bucket 5 — later (3) · system / parked

- **D10-skill-scope-genre-style** · `D10` · _open_ — skill-scope.js (+ check) still models the godot {genre, style} game-profile filter with godot-\* fixtures; mechanism generic, vocabulary engine payload. Re-parameterize profile axes per domain descriptor, or strip until a second domain needs it. Found 2026-07-24.
- **D9-caveman-gate** · `D9` · _open_ — caveman enforcement is prompt-only (per-tool reminder hook deleted afa2a79, 2026-06-26) with NO compliance measurement; review iter1 claims ~0% compliance ('[cvmn]' in 0/708 blocks); decide: restore a slim observe+score hook (review P0B-2 + P0B-7 banned-pattern list) or measure first and accept prompt-only. Fork note: the shipped skill is caveman-forge (renamed over a builtin collision).
- **D8-result-contract-unenforced** · `D8` · _open_ — agent-report/SKILL.md:31 contracts the relayed result to '<path> — gate PASS|FAIL' but nothing enforces it — no SubagentStop hook anywhere (verified 2026-07-08); review measured ~1.2k-char avg prose results vs the ~50-char contract; harden: SubagentStop regex validator + digest cap ≤6 lines (review P0B-3 merged schema).

## Bucket 6 — skip (0) · tombstones — recorded so they are not re-filed

_none_

## Parking — dimension ideas (unactioned)

- skill-content-gap dimension — a skill missing a known technique/caveat maps to no clean D1–D9
- D11 'seam integrity' dimension — do the framework's own gates (promote/materialize/validate) enforce the conventions its docs state? [renumbered D10→D11 when abstraction-level/domain-layering took D10]
- restore an `npm run ledger` generator for LEDGER.md/ledger.html — the views are hand-synced since the fork dropped the upstream script

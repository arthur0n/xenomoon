<!-- GENERATED from LEDGER.json by `npm run ledger` — DO NOT EDIT; edit LEDGER.json. (No regen script exists in this fork yet — this view was hand-synced 2026-08-13; see parking.) -->

# Framework audit ledger

**open (fix-now): 6 · later: 4 · skip: 0**

_Last audit:_ 2026-08-13 (full pass, single context, expoapp pack installed) — 14 new findings + D9-caveman-gate upgraded from hypothesis to MEASURED. Headline: `npm run validate` was RED (check:skills) and BOTH agnostic gates were blind where it matters. **11 findings applied same day** (see git): the gate is green again, the CORE spine's precedence sentence is fixed, two stale hardcoded file lists are now derived, and both contamination gates now derive the bound project's terms and scan the CORE plugin tree (which immediately caught a real leak in `ui/server/cli/start-profile.js`). PRIOR: 2026-07-24 recalibration.

> Source of truth is **`LEDGER.json`** — edit that. This file is a hand-synced view. Applied findings are DELETED (git is the fix record), never stamped.

## Bucket 3 — no-brainers (0) · fix-now · mechanical

_none_

## Bucket 4 — improvements (6) · fix-now · needs judgment (/framework-audit-fix)

- **D8-badges-count-untracked** · `D8` · _open_ — `update-badges.js` counts the FILESYSTEM plugin tree, so a local `forge new` inflates the shipped badges: the pre-commit hook rewrote README + marketplace.json to Skills 20 / Agents 7 while the trunk ships 13 / 5. No gate catches it (validate skips badges by design). Count `git ls-files plugin/{skills,agents}` instead. Accepted knowingly in the 2026-08-13 audit-fix commit.

- **D10-mobile-record-core-tier** · `D10` · _open_ — the Clerk/EAS/Play launch record is Expo-mobile payload sitting in the GENERIC CORE library, untracked — ships to nobody while polluting the neutral tier. Move to `domains/expoapp/plugin/library/findings/`. (Its project-name leak is fixed; the tier is not.)
- **D10-fork-sync-in-domain** · `D10` · _open_ — `fork-sync-upstream` is self-declared domain-agnostic yet lives in `domains/expoapp`; a webapp fork cannot reach it. Dependency-direction inversion → promote to CORE.
- **D9-caveman-gate** · `D9` · _open_ — MEASURED: the observe+score hook is restored and wired; `logs/caveman-gate.log` = 2378 rows, `marker:true` 23 (0.97%), `verbose:true` 168 (7%). Terseness holds; the `[cvmn]` marker is never emitted. Decide: drop the marker convention or enforce it deterministically. (Rows repeat per tool call — directional, not per-message.)
- **D8-epic-grill-layer-unproven** · `D8` · _open_ — the 2026-07-30 adaptation wave (product-owner rename; grill + /grill; xeno-epic + `mcp__ui__epic` + /epic; skill-writing doctrine) is validate-green but has zero end-to-end runs. Pilot epic chart→decide→slice on a real project, score the new skills against skill-writing.md, sweep for dangling designer refs.
- **D7-contribute-two-tree** · `D7` · _open_ — `plugin/commands/contribute.md` (SHIPPED) still assumes the dead two-tree model; `promote-run.js` lands promotions in `plugin/{skills,library}/`. Needs a redesign (provenance by git history / promotions board, not path).

## Bucket 5 — later (4) · system / parked

- **D5-token-audit-two-copies** · `D5` · _open_ — token-audit exists as two diverged copies (shipped 1715 w vs forge-local 2309 w); the shipped one lacks two sections and the whole `history.json` half, with nothing keeping them in sync.
- **D10-fork-divergence-wiring** · `D10` · _open_ — fork-divergent surfaces (roster rename, `mcp__ui__epic`, grill/xeno-epic, skill-writing doc) have no systematic wiring check; name them as first-class seams in `docs/fork/SEAMS.md`. Invariant from the first live bite: the trunk never tracks a path a domain-pack install writes.
- **D10-skill-scope-genre-style** · `D10` · _open_ — `skill-scope.js` still models the godot {genre, style} profile filter with godot-\* fixtures; mechanism generic, vocabulary engine payload.
- **D8-result-contract-unenforced** · `D8` · _open_ — `agent-report/SKILL.md:31` contracts the relayed result to `<path> — gate PASS|FAIL`; nothing enforces it (no SubagentStop hook). Harden with a regex validator + digest cap.

## Bucket 6 — skip (0) · tombstones — recorded so they are not re-filed

_none_

## Parking — dimension ideas (unactioned)

- skill-content-gap dimension — a skill missing a known technique/caveat maps to no clean D1–D9
- D11 'seam integrity' dimension — do the framework's own gates (promote/materialize/validate) enforce the conventions its docs state? [renumbered D10→D11 when abstraction-level/domain-layering took D10]
- restore an `npm run ledger` generator for LEDGER.md/ledger.html — the views are hand-synced since the fork dropped the upstream script

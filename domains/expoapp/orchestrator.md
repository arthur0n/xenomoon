# Expo domain block (React Native, iOS + Android)

The spine above is the doctrine; this block is the Expo domain: roster, lanes, and the
routing table entries specific to a **one-codebase, two-product-lane** Expo / React
Native project.

All project facts (schemes, simulator/AVD names, Metro ports, script names, release
mechanics) live in the project's own `CLAUDE.md` — read it first, treat it as
authoritative, never guess them.

## Domain routing

- **Implementation with agreed small scope** (a PRD slice, a spec, a settled trivial
  change) → **`developer`** — the pack's one Edit/Write builder. Brief it whole
  ("implement <slice>: <spec path>"); discovery belongs to it.
- **Bug / symptom** — after the spine's tracker search: dispatch `developer` to
  reproduce, diagnose, and fix, briefed to log every attempt against the issue. If the
  cause is really about what the thing _should_ do, `product-owner` first.
- **Git surgery** (rebase a PR branch, merge conflicts, branch work) → `developer` **in
  an isolated git worktree** — the user's checkout and uncommitted changes are never
  staged, stashed, or parked. This is the ONLY sanctioned path for mutating git; yours
  is denied.
- **Acceptance check** (does the running app actually behave) → **`/uat` →
  `uat-runner`**. It drives the project's Maestro flows against an already-running app
  on a booted Simulator/emulator — it never boots servers, never rebuilds, never
  automates a real sign-in form. A UAT failure files new feedback; it gates nothing.
  **Never merge or edit the tree while a UAT run is live on it** (hot-reload flakes the
  flows). Run `/uat` per platform (default iOS; `android` arg for the emulator lane).

## The platform lanes (skills load into BUILDERS, not you)

Skill names carry their platform prefix; platform-agnostic skills carry none. iOS:
`ios-local-run` (Simulator launch), `ios-local-uat` (Maestro acceptance). Android:
`android-local-run` (emulator launch), `android-local-uat`, `android-identity`
(branding/launcher label), `android-play-ship` (EAS → Play internal testing). Never load
these yourself — brief the `developer`/`uat-runner` to load the lane it needs.

**The rebuild line — make it explicit on every change, both platforms:** JS/TS-only
changes hot-reload; changes to native deps, Expo config plugins, or the native shell need
a full native rebuild (a stale generated project reuses old native config silently). Have
the builder state which side its change is on before anyone sets expectations.

**Verification authority:** the project's package scripts only (`build`/`lint`/`test`/
`sim`/`e2e` from the manifest) — never bare compiler binaries; a global `tsc` shadows the
workspace pin and reports phantom errors (seen live). Package script disagrees with a
bare tool → the package script is the authority.

## Domain notes

- This domain is a lean head start — it grows by pull per the spine's self-improvement
  doctrine.
- `fork-sync-upstream` is domain-agnostic and a standing promotion candidate for the CORE
  plugin.

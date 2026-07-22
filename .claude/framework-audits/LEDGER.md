<!-- GENERATED from LEDGER.json by `npm run ledger` — DO NOT EDIT; edit LEDGER.json. -->

# Framework audit ledger

**open (fix-now): 0 · later: 9 · skip: 3**

_Last audit:_ 2026-07-08 — full 9-dim fan-out pass (8 gather agents, ~355k subagent tokens); D1/D4 clean; filed 7 no-brainers + 7 improvements + 3 laters + 1 skip-tombstone. Self-fixed framework-audit.md in-pass: sibling list → glob (×2, was silently omitting token-audit.md), tools/ → plugin/tools/ in D8, Never-bullet no longer recommends the rtk grep it bans. Process note: fan-out gather worked but D9-audit-fanout single-agent comparison still unmeasured. Same day: integrated external review iter1 (86 extracted items → 1 no-brainer + 2 improvements + 4 laters filed after 3-agent repo-state verification; 1 existing row upgraded to MEASURED; roadmap waves parked as pointer; 2 review claims already resolved in repo).

> Source of truth is **`LEDGER.json`** — edit that, then `npm run ledger` (pre-commit also regenerates). This file + `ledger.html` are generated views. Applied findings are DELETED (git is the fix record), never stamped.

## Bucket 3 — no-brainers (0) · fix-now · mechanical (framework-nobrainer-fixer)

_none_

## Bucket 4 — improvements (0) · fix-now · needs judgment (/framework-audit-fix)

_none_

## Bucket 5 — later (9) · system / parked

- **D5-builder-restates-verify-rest** · `D5` · _open_ — REMAINDER of D5-builder-restates-verify (applied to godot-dev + godot-visuals 2026-07-15): the other 5 builder agents still carry the near-verbatim godot-verify 'interactive/on-screen acceptance' paragraph (2026-07-08 D8 note: all 7 builders' Verification blocks are copies), and godot-visuals:38 still restates godot-verify's tscn-comment rule. Same fix as the applied precedent — replace the long restatement with a pointer to the preloaded godot-verify (Layer 5 + interactive-acceptance section), keep the inline validate.sh gate one-liner. Enumerate the 7 builders via the BUILDERS alias in ui/server/features/skills/skill-registry.js; keep godot-dev's Transform3D clause (distinct mesh/collider-drift rationale, not a pure copy).
- **D2-engine-version** · `D2` · _open_ — engine version drift across skills: 'Godot 4.6' (greybox, enemy-ai, godot-assets) vs '4.3+' (pixel-lighting) — framework-wide consistency pass.
- **D7-display-clobber** · `D7` · _open_ — INVESTIGATE: human repeatedly reports the game's display/window settings reverting ('back to super small, mode !=2'). Determine whether a framework step (materialize/doctor/setup, or the screenshot/verify GD scripts) rewrites project.godot display settings instead of preserving the game's; if game-local config, drop.
- **D9-greybox-eye-harden** · `D9` · _open_ — HARDEN (partial): godot-greybox:47 ships a 'self-audit BY EYE' gate; a subset is deterministic (nav-graph reachability, dead-end count, missing NavigationRegion3D, cover-node count) — sibling godot-gridmap-level already hardened its by-eye out. Draft check_greybox_reachability; visual principles (sightline, mystery) stay by-eye. See D8-navmesh-check-orphan: check_navmesh_baked already exists uncomposed.
- **D9-model-pin-retier** · `D9` · _open_ — Model-upgrade ritual due: Fable 5 is now the session default; re-tier the 13 sonnet + 1 haiku agent pins (the sole haiku pin is godot-refactor, which EDITS gdscript, justified only by 'mechanical' — the other haiku pin, handoff-summarizer, was deleted by D9-handoff-summarizer-strip) on a sample task with a before/after measurement — keep/strip/retier per pin, not by hunch.
- **D9-arena-eye-harden** · `D9` · _open_ — HARDEN (partial): godot-arena-spatial-design:19,32,53 'self-audit BY EYE' has a measurable subset (loop topology / no degree-1 dead-ends, interior-foothold count, hall ≥2.0m + doorway ≥1.25×2.5 scale, ≥3 nameable sub-regions) — draft check*arena*\*; sightline/mystery principles stay by-eye. Sibling of D9-greybox-eye-harden; godot-gridmap-level is the hardened reference.
- **D9-caveman-gate** · `D9` · _open_ — caveman enforcement is prompt-only (per-tool reminder hook deleted afa2a79, 2026-06-26) with NO compliance measurement (no gate log exists); review iter1 claims ~0% compliance ('[cvmn]' in 0/708 blocks); decide: restore a slim observe+score hook (review P0B-2 + P0B-7 banned-pattern list) or measure first and accept prompt-only.
- **D8-result-contract-unenforced** · `D8` · _open_ — agent-report/SKILL.md:31 contracts the relayed result to '<path> — gate PASS|FAIL' but nothing enforces it — no SubagentStop hook anywhere (verified 2026-07-08); review measured ~1.2k-char avg prose results vs the ~50-char contract; harden: SubagentStop regex validator + digest cap ≤6 lines (review P0B-3 merged schema).
- **D9-docs-cache-dated** · `D9` · _open_ — TECH DEBT (permanent arm of token opp `godot-docs-memoize`; in-session dedup already SHIPPED as ui-control.js docsDedupDecision, wired in makeCanUseTool). Build a dated, TRIMMED cross-session Godot-API library cache: PostToolUse on godot_docs_get_class stores a trimmed view (methods/signals/property SIGNATURES only, ~4k) to plugin/library/godot-api/<Class>.md with frontmatter fetched:<date>; PreToolUse serves it when <3 months old (deny full MCP → Read local), refetch when stale/missing. Cuts docs tokens on EVERY call (not just in-session repeats) + gives freshness via the 3-month TTL. RISK: deterministic trim of the ~20k dump is format-fragile — needs a careful parser or it drops members the model needs (fall back to full fetch on a stale/miss). Cross-ref .claude/token-audits/ (history opp godot-docs-memoize).

## Bucket 6 — skip (3) · tombstones — recorded so they are not re-filed

- **D9-cache-breakpoint-nolever** · `D9` · _skip_ — NOT actionable (verified 2026-07-08): 'place stable-before / volatile-after the prompt-cache breakpoint' has NO framework lever — all sessions run through Agent SDK query() (session.js); there is no cache_control API surfaced and the SDK owns caching internally. Framework prefix is already deterministic and volatile-data-last (config.js static readFileSync concat; task/answer/game-state enter as post-prefix messages/mcp tools — verified, no Date/session-id/game-state in the prefix). Real token burn is per-agent skill counts (15 on godot-enemy/-assets) + agents re-reading once-needed context, tracked elsewhere. Tombstone so the breakpoint idea isn't re-filed. (One residual FS-order nit split out as D9-skill-list-unsorted.)
- **D5-research-intake** · `D5` · _skip_ — NOT a clean extraction (verified): the shared research-intake core is only ~2 sentences (Hermes-intake principle + forge-facts rule) and each researcher tailors it — partial dedup + always-needed → inline (reliability > DRY). Kept as a tombstone so it isn't re-filed.
- **D2-convention-vocab** · `D2` · _skip_ — NOT contamination (verified 2026-07-08): FallZone/SpawnMarker3D/WaveManager/CastData refs across greybox/runtime-arena/gridmap/shooter/code-rules skills are framework convention vocabulary — the skills themselves define these patterns and siblings cross-reference them. Tombstone: literal sweeps will keep re-finding them.

## Parking — dimension ideas (unactioned)

- skill-content-gap dimension — a skill missing a known technique/caveat maps to no clean D1–D9
- D11 'seam integrity' dimension — do the framework's own gates (promote/materialize/validate) enforce the conventions its docs state? (this pass's D2-library-gate-blindspot is exactly a seam-integrity find) [renumbered D10→D11 when abstraction-level/domain-layering took D10]
- 2026-07-06 external review (docs/xenodot/2026-07-06-framework-review-iter1.md) = ROADMAP source (capabilities.json routing, domain taxonomy, bolts, starter/onboarding waves, seam check\_\*, autoload/shadow/dir gates) — plan work lives in that doc, ledger tracks only drift; verified already-resolved there: gdlintrc is 500 now, host-agnostic seam rule already in godot-composition rules 5/6

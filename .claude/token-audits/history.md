<!-- GENERATED from history.json by `npm run token-history` — DO NOT EDIT; edit via the CLI. -->

# Token history — spend trend

> PERMANENT append-only time-series (opposite of the ephemeral framework-audit ledger). Each run covers different sessions, so raw covered cost is NOT the trend — the comparable signals are the NORMALIZED columns (hitRate, $/turn) and the **global** snapshot line.

## Trend (newest first)

| date | #sess | covered $ | tok | hit% | $/sess | $/turn | global $ | global tok | global hit% |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 2026-09-01 | 4 | 1057.7787 | 32361k | 97 | 264.4447 | 18.8889 | 1057.7787 | 32361k | 97 |
| 2026-08-13 | 5 | 4846.9933 | 78913k | 97 | 969.3987 | 26.6318 | 5190.7555 | 96627k | 96 |
| 2026-07-24 | 2 | 1534.3083 | 60551k | 98 | 767.1541 | 31.9648 | 1535.8097 | 61028k | 98 |
| 2026-07-11 | 2 | 475.8742 | 3021k | 96 | 237.9371 | 0.2684 | 6535.0619 | 75259k | 97 |
| 2026-07-10 | 2 | 475.8742 | 3021k | 96 | 237.9371 | 0.2684 | 6535.0619 | 75259k | 97 |
| 2026-07-09 | 3 | 27.5328 | 2574k | 96 | 9.1776 | 0.1343 | 6535.0619 | 75259k | 97 |
| 2026-07-08 | 7 | 3315.3861 | 32857k | 95 | 473.6266 | 0.4514 | 6507.5291 | 72685k | 97 |

## Opportunities (did the fix move the metric?)

| filed | id | est tok | landed | moved | Δtok | Δ$ | result |
|---|---|--:|:-:|:-:|--:|--:|---|
| 2026-07-08 | godot-docs-memoize | 55000 | ✓ | false | — | — | RETIRED — godot-only (dedups mcp__godot-docs__godot_docs_get_class). godot is upstream-only here; this fork runs webapp/app domains, so the marker never fires and it can never be confirmed in-fork. The agnostic version (dedup immutable external-docs re-fetches) ships as read-dedup for files; refile fresh under an agnostic id if a webapp docs-MCP needs it. |
| 2026-07-24 | read-dedup | 200000 | ✓ | true | 35000 | — | Applied PreToolUse(Read) dedup hook plugin/hooks/read-dedup.sh (WINDOW=20), emits policy:read-dedup per denial. CORRECTED 2026-09-01: the 08-13 count (22) was string-doubled — real 11 lines; +14 lines this run (08-21 x2, 09-24 x3, 11-53 x9) = 25 denials x 1.4k = 35k tok cumulative hard actual. Count raw ndjson lines, not ..|strings. |
| 2026-08-13 | pr-plumb-cli | 14000000 | ✓ | true | 3290000 | 231 | CONFIRMED 2026-09-01 across 4 sessions (08-21, 08-30 x3): merge/retarget/promote/prune Agent dispatches dropped from ~30/session (12-58) to 0; 9 issuekit ops ran in MAIN as ONE Bash call each (pr-merge x3, promote, branch-prune, pr-new, branch-sync, branch-new x2). Credited 7 (the previously-dispatched class; branch-new excluded) x 470k. Counted as RAW LINES with op=<verb> — the ..|strings path double-counts and doc mentions in orchestrator.md contaminate. Residual: 08-21 still dispatched a promote as two agents (FF development + push development). |
| 2026-08-13 | graphify-first | 80000 | ✓ | false | 0 | — | NO MOVE 2026-09-01: 3 fires across 4 sessions, EVERY one on a literal-identifier Grep (proposedCombos|onReserveCombo, resetIfNewLook, verifier-(ios|android)) and the subagent re-ran the identical Grep next turn — net cost one wasted turn per fire. Zero graphify conversions; rawsearch counts 19-21/session, unchanged vs pre-fix (20-44). The hook cannot tell a where/how question from an identifier lookup. Retire, or re-scope to fire only on a Read fan-out (>=N distinct Reads with no Edit) rather than the first Grep. |
| 2026-09-01 | commit-push-cli | 7500000 | ✓ | pending | — | — | APPLIED 2026-09-02: issuekit push-check (ui/server/cli/issuekit-push.js) = push-method §1 as one deterministic call (tree/model/upstream/ff/newest lane verdicts per (#N)/PR checks or last run), receipt + the exact bare git push to run; exit 1 STOP naming the owning stage. Emits policy:"commit-push-cli" op=push-check per run. Lane KEPT (orchestrator still dispatches senior-analyst — MAIN_PUSH_DENY is a deliberate design rule; a tool pushing from inside node would bypass both gates), so the fix shrinks the dispatch, not the count. Commit half = routing fix only: installed plugin/orchestrator.md + expoapp pack now say commit direct (no agent) — issuekit commit already existed. BEFORE: push dispatch subtree avg ~1.5M cache-read tok (1.15/1.14/1.28/1.54/1.72/2.12M), 13–37 tool calls; commit dispatch avg ~1.08M. AFTER = next audit: count op=push-check lines and re-measure push-dispatch subtree size (expect ~3 tool calls); credit min(count, push dispatches) × 470k conservative unit; commit-dispatch count should drop to 0. |
| 2026-09-01 | issue-digest | 40000 | — | — | — | — | — |


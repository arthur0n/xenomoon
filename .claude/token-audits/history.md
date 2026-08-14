<!-- GENERATED from history.json by `npm run token-history` — DO NOT EDIT; edit via the CLI. -->

# Token history — spend trend

> PERMANENT append-only time-series (opposite of the ephemeral framework-audit ledger). Each run covers different sessions, so raw covered cost is NOT the trend — the comparable signals are the NORMALIZED columns (hitRate, $/turn) and the **global** snapshot line.

## Trend (newest first)

| date | #sess | covered $ | tok | hit% | $/sess | $/turn | global $ | global tok | global hit% |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
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
| 2026-07-24 | read-dedup | 200000 | ✓ | true | 30800 | — | Applied PreToolUse(Read) dedup hook plugin/hooks/read-dedup.sh: denies a byte-identical repeat read (same path+offset+limit, mtime unchanged, last real read within WINDOW=20 read-events) with a stub; emits policy:"read-dedup" per denial. Next audit tallies denials × ~1.4k tok. Safe-window scoped so post-compaction re-hydration passes. |
| 2026-08-13 | pr-plumb-cli | 14000000 | ✓ | pending | — | — | AFTER re-check 2026-08-14: 0 fires across all session logs. No PR-plumbing work has happened since the fix landed, so there is nothing to credit — absence of traffic, not absence of effect. Same measurement path that shows read-dedup at 169 hits. Note the marker is emitted by issuekit itself (an external CLI), so it only reaches a session log when an issuekit op runs inside a logged UI session — a plumbing op run from a bare terminal is invisible to this tally. Related work landed 2026-08-13/14: the orchestrator PR-plumbing routing bullet existed ONLY in the installed plugin/orchestrator.md and was ported back to its pack source domains/expoapp/orchestrator.md (framework-audit D6-orchestrator-install-drift, commit 4299d2e) — before that, no fresh expo install would have routed plumbing to issuekit at all, which is itself a reason the marker could never have fired. Re-measure after the next PR-plumbing session. |
| 2026-08-13 | graphify-first | 80000 | ✓ | pending | — | — | AFTER re-check 2026-08-14: 0 fires. NOT a failure — no qualifying traffic. Only one session ran post-fix (08-13T11-06, the applying session itself); this CLI session writes no session-*.ndjson (those come from the UI server). Hook VERIFIED WIRED by direct payload test through all 4 gates: graph-backed Grep -> deny + policy marker; same session again -> silent allow (one-shot holds); non-graph dir -> allow; non-Grep tool -> allow. Method is sound: read-dedup's marker shows 169 hits across logs by the same counting path. CAVEAT for next tally: the graph walk-up can resolve to an ANCESTOR workspace graph (searching in maggie-xm found /MRHEWBUC-LOCAL/graphify-out, not a repo-local one) — confirm the found graph actually indexes the searched repo before crediting a fire. Re-measure after the next graph-backed UI session. |


<!-- GENERATED from history.json by `npm run token-history` — DO NOT EDIT; edit via the CLI. -->

# Token history — spend trend

> PERMANENT append-only time-series (opposite of the ephemeral framework-audit ledger). Each run covers different sessions, so raw covered cost is NOT the trend — the comparable signals are the NORMALIZED columns (hitRate, $/turn) and the **global** snapshot line.

## Trend (newest first)

| date | #sess | covered $ | tok | hit% | $/sess | $/turn | global $ | global tok | global hit% |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 2026-07-24 | 2 | 1534.3083 | 60551k | 98 | 767.1541 | 31.9648 | 1535.8097 | 61028k | 98 |
| 2026-07-11 | 2 | 475.8742 | 3021k | 96 | 237.9371 | 0.2684 | 6535.0619 | 75259k | 97 |
| 2026-07-10 | 2 | 475.8742 | 3021k | 96 | 237.9371 | 0.2684 | 6535.0619 | 75259k | 97 |
| 2026-07-09 | 3 | 27.5328 | 2574k | 96 | 9.1776 | 0.1343 | 6535.0619 | 75259k | 97 |
| 2026-07-08 | 7 | 3315.3861 | 32857k | 95 | 473.6266 | 0.4514 | 6507.5291 | 72685k | 97 |

## Opportunities (did the fix move the metric?)

| filed | id | est tok | landed | moved | Δtok | Δ$ | result |
|---|---|--:|:-:|:-:|--:|--:|---|
| 2026-07-08 | godot-docs-memoize | 55000 | ✓ | false | — | — | RETIRED — godot-only (dedups mcp__godot-docs__godot_docs_get_class). godot is upstream-only here; this fork runs webapp/app domains, so the marker never fires and it can never be confirmed in-fork. The agnostic version (dedup immutable external-docs re-fetches) ships as read-dedup for files; refile fresh under an agnostic id if a webapp docs-MCP needs it. |
| 2026-07-24 | read-dedup | 200000 | ✓ | pending | — | — | Applied PreToolUse(Read) dedup hook plugin/hooks/read-dedup.sh: denies a byte-identical repeat read (same path+offset+limit, mtime unchanged, last real read within WINDOW=20 read-events) with a stub; emits policy:"read-dedup" per denial. Next audit tallies denials × ~1.4k tok. Safe-window scoped so post-compaction re-hydration passes. |


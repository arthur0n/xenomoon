# Token-audit ledger

Running record for `/token-audit`. The hive's session logs are mined a couple at a
time for turns we could make deterministic (a script/tool/hook instead of an agent/LLM call).

**How to use:** read this file first. Skip any session already in `Covered sessions`. After a
run, add the analyzed tags below and append ONE super-brief entry under `Audits`. Keep it
scannable — this is the memory the next run learns from, not a report.

Entry template:

```
### <YYYY-MM-DD> — sessions: <tag>, <tag>
- Offenders: <top 1–3: wasteful pattern + rough token/$ cost>
- Opportunity: <deterministic replacement for an agent/LLM turn> → task <id>
- Process note: <improvement to this command/loop, or "none">
```

## Covered sessions

<!-- one session-tag per line (the part between `session-` and `.ndjson`); newest at the bottom -->

2026-07-03T10-35-55-045Z
2026-07-03T18-42-56-256Z
2026-07-04T22-05-02-866Z
2026-07-05T14-52-32-766Z
2026-07-06T07-39-33-283Z
2026-07-07T07-15-06-288Z
2026-07-08T06-40-55-221Z
2026-07-08T17-28-15-668Z
2026-07-08T20-33-26-012Z
2026-07-09T15-44-24-254Z
2026-07-23T18-56-50-528Z
2026-07-23T19-15-28-806Z
2026-07-23T20-05-49-381Z
2026-08-01T10-44-05-203Z
2026-08-02T10-24-18-631Z
2026-08-02T10-24-31-927Z
2026-08-02T10-24-34-626Z
2026-08-02T10-24-40-523Z
2026-08-02T10-24-51-878Z
2026-08-05T07-46-23-721Z
2026-08-05T16-49-43-260Z
2026-08-05T16-49-58-243Z
2026-08-05T16-50-24-247Z
2026-08-05T19-02-01-390Z
2026-08-05T19-10-51-199Z
2026-08-07T11-45-29-143Z
2026-08-07T14-38-58-306Z
2026-08-10T09-36-14-945Z
2026-08-11T05-31-45-427Z
2026-08-11T08-41-24-172Z
2026-08-11T08-41-27-298Z
2026-08-11T11-59-03-890Z
2026-08-11T12-37-41-359Z
2026-08-11T12-37-51-319Z
2026-08-11T12-43-36-758Z
2026-08-11T12-58-24-386Z
2026-08-11T18-25-13-844Z
2026-08-12T17-10-00-753Z

## Audits (newest first)

### 2026-08-13 — sessions: 08-11T12-37-51, 08-07T11-45, 08-10T09-36, 08-11T08-41-27, 08-11T12-58 (+15 zero-turn stubs → covered, no slot; 08-13T11-06 left uncovered — in progress, no result events yet)

- Offenders: **Mechanical PR-plumbing Agent dispatches.** 08-11T12-58 is a $4,297 / 130-turn orchestrator session (61.9M cache_read tok, ~476k/turn avg, top turns $72 at ~1M cache_read). Of its 57 Agent dispatches, ~30 are deterministic gh/git sequences — "Merge PR 241/242/243/244/253", "Retarget PR 241–244", "Promote development to main", "Prune branches and sync development", "Push and open PR", "Refresh PR 242 checks" — WITH visible retry pairs ("Merge PR 253" ×2, "Promote… retry", "Push PR merge retry") proving agents flub mechanical work then get re-dispatched. Each dispatch costs a subagent run PLUS orchestrator supervise turns at ~$33/turn → the mechanical share is roughly $1–2k of the session. #2: **graphify bypass** — sessions run in maggie (graph-backed: `graphify-out/graph.json` exists) yet 08-07T11-45 (solutioning, $69.75) did 44 Grep + 99 Read (456k chars ≈ 114k tok) with ZERO `graphify query|path|explain`; 08-11T08-41-27: 20 rawsearch, 0 graphify.
- Opportunity 1: **`pr-plumb-cli`** — a deterministic CLI verb set (issuekit-style: `retarget <pr> <base>`, `merge-when-green <pr>`, `promote <from> <to>`, `prune-sync`) the orchestrator calls as ONE Bash tool call instead of an Agent dispatch; built-in retry/verify so no re-dispatch. Signal: each run logs `policy:"pr-plumb-cli"` once per operation; unit ≈ one avoided dispatch+supervise turn ≈ **470k cache-read tok** (~$33). Est ceiling ~14M cache-read tok (~$1.3k)/plumbing-heavy session. **TASK (owner:user)** [id `pr-plumb-cli`, apply via `/token-audit-fix pr-plumb-cli`] — mcp**ui**tasks unreachable from terminal; recorded here.
- Opportunity 2: **`graphify-first`** — route codebase where/how questions to `graphify query` before raw Grep/Read fan-out in graph-backed repos (orchestrator/solutioner hint or PreToolUse nudge on Grep when graph.json exists and no graphify call happened yet this session). Signal: log `policy:"graphify-first"` once per routed question; unit ≈ the avoided fan-out delta (~5k tok each). Est ~80k tok/solutioning session. **TASK (owner:user)** [id `graphify-first`, apply via `/token-audit-fix graphify-first`] — recorded here (terminal fallback).
- Pending re-check: **`read-dedup` CONFIRMED → landed moved:true.** Denials counted across covered sessions: 12-58 ×2, 08-41-27 ×8, 08-10 ×6, 08-07 ×6, 12-37-51 ×0 = **22 × 1.4k ≈ 31k tok hard actual**. Corroborated: read churn collapsed (worst path ×3 vs ×24 pre-hook).
- Discarded: `gh auth switch + repo view` combo ×38 in 12-58 — avg result 140 chars, token-negligible (latency/determinism smell only). UAT/QA/solution dispatches (08-10, 08-07) are judgment-heavy — correct agent use. Read churn now minimal everywhere (hook working).
- Process note: replaced the size-based stub rule in step 2 with a zero-result-events jq gate that also flags in-progress sessions (assistant events, no results) — size misclassified 2 snapshot files (36–48K, zero LLM turns) this run.
- Fix note (2026-08-13, graphify-first applied): hook is ONE-SHOT per session (can't see "questions"), so the marker counts nudged sessions, not routed questions — tally fires × ~5k tok as the conservative floor; the real win (model switching a whole fan-out to graphify query) shows up as rawsearch-count drop in graph-backed-repo sessions, worth eyeballing alongside the count.
- Fix note (2026-08-13, pr-plumb-cli applied): issuekit already carried most plumbing verbs — future opportunities should check the existing tool surface before estimating a build. Tally caveat for next audit: count `policy:"pr-plumb-cli"` × 470k ONLY as far as Agent PR-plumbing dispatches actually dropped (marker also fires on ops that were never dispatches); cross-check dispatch descriptions before flipping to a hard actual.
- **Re-check 2026-08-14 (no new audit — AFTER pass on the two pending fixes): BOTH STAY `pending`, 0 fires each.** Not a no-move: there has been no qualifying traffic. Only one session exists post-fix (08-13T11-06, the applying session itself), and a CLI/terminal session writes no `session-*.ndjson` at all — those come from the UI server, so this loop is blind to terminal work. Counting method confirmed sound: `read-dedup` shows **169** marker hits across the same logs. `graphify-first` additionally VERIFIED WIRED by direct payload test — graph-backed Grep → deny + marker; repeat in-session → allow (one-shot holds); non-graph dir → allow; non-Grep tool → allow. So both are applied-and-live, awaiting exercise. Flip them on the next graph-backed UI session / next PR-plumbing session.
- Method note for the next tally (found during the re-check): the `graphify-first` graph walk-up can resolve to an **ANCESTOR workspace** graph — a Grep inside `maggie-xm` (which has no graph of its own) matched `/MRHEWBUC-LOCAL/graphify-out`. Before crediting a fire, confirm the found graph actually indexes the searched repo, or the nudge points at a graph that can't answer. Same class of caveat as the pr-plumb marker firing on non-dispatch ops.

### 2026-07-24 — sessions: 07-23T20-05, 07-23T18-56 (stub 07-23T19-15 → covered, no slot; 07-23T16-13 left uncovered for next run)

- Offenders: **Read churn.** 07-23T20-05 is a big lexflow (webapp domain) coding session ($70–82/turn, 6 turns of pure cache_read on standing orchestrator ctx — inherent, not convertible). Payload leader = `Read` (393 calls, 2.19M chars ≈ 547k tok). Of 323 **full** reads, **156 (~48%) are re-reads of the same path with NO intervening Edit/Write** — identical file content re-entering context (allowance.ts 24 full reads / 9 edits, ai.router.ts, subscription.ts, docs/monetization.md 12 full / 3 edits, …) ≈ **218k tok/session** of pure churn. Bash (538 calls, 1.09M chars) is #2 but dominated by legit validate/build (`rtk pnpm validate` ×36, `build` ×17) + the issue-view jq comment-cap heredoc — not convertible. 07-23T18-56 = tiny (10 Bash, ~$1–2/turn) → no offender.
- Opportunity: **PreToolUse Read-dedup hook** — on a `Read` whose (path, offset, limit) matches a RECENT prior read this session with the file's **mtime unchanged**, deny with a stub ("unchanged since turn N — content already in context; re-read only if compacted") and log `policy:"read-dedup"`. Deterministic (mtime is exact), DEDUPs the payload (~1.4k tok/full read out of context), and COUNTABLE. **Scope to a safe window** (recent reads only) so post-compaction re-hydration reads still pass — a far-apart re-read after a summary is legit. → **TASK (owner:user)** [id `read-dedup`, est ~200k tok/session ceiling] — **APPLIED 2026-07-24** as `plugin/hooks/read-dedup.sh` (PreToolUse Read, WINDOW=20); landed `pending` — next audit counts `policy:"read-dedup"` × ~1.4k tok.
- Signal to instrument: `policy:"read-dedup"` once per denied repeat; per-event unit ≈ **1.4k tok** (avg full-read payload). Next audit tallies denials × 1.4k → hard actual.
- Pending re-check: `godot-docs-memoize` **RETIRED** (`moved:false`) — it dedups the godot-only `mcp__godot-docs__godot_docs_get_class`, but godot is upstream-only here and this fork runs webapp/app domains, so the marker can never fire in-fork → it was rotting `pending` every run, unconfirmable by construction. The agnostic form (dedup immutable external-docs re-fetches) ships as `read-dedup` for files; refile fresh under an agnostic id if a webapp docs-MCP ever needs it.
- **Rule (naming):** token-loop opportunity ids must be **domain-agnostic** — no engine/product names (`godot-*`, etc.). An engine-specific id in a domain-agnostic fork strands the opportunity as un-fireable. Name the CLASS of fix (`mcp-docs-dedup`), not the instance.
- Process note: Added a named "Read churn (no-mutation re-reads)" sweep to step 3 of token-audit.md — the existing sweeps (costliest/tool-freq/result-bytes) structurally can't tell wasteful identical re-reads from edit-driven ones; this offender only surfaced via an ad-hoc awk one-liner, now reproducible.

### 2026-07-09 — sessions: 07-08T17-28, 07-08T20-33, 07-09T15-44

- Offenders: **none convertible.** 07-08T17-28 & 20-33 are 6-line status stubs (no LLM turns). 07-09 ($27.5, 6 turns) is legit framework synthesis — transcript-researcher/skill-researcher harvesting 3 game transcripts into convention skills. Payload leader = `Read` (43 calls, 393k chars ≈ 98k tok) but reads are near-distinct (top repeat ×3, edit-driven) and no main↔subagent duplication; the 9 Agent dispatches are all judgment-heavy (draft/revise skills). Costliest turns = pure cache_read on standing orchestrator ctx ($10.2/$7.4, 600–800k cache_read) — inherent, same as prior audit.
- Opportunity: none filed this run — nothing here runs without a model.
- Pending re-check: `godot-docs-memoize` stays **pending** — 0 godot-docs calls in any covered session, so the shipped dedup denial fired 0× → uncountable this run. Next run with real game-doc lookups must count the denial marker and flip it.
- Process note: append CLI auto-computes metrics from `--sessions`; a run can legitimately file **zero** opportunities (record the offender="none" + note, skip `--opp`). jq `.text?//""` fails on the installed jq — **fixed** in `.claude/commands/token-audit.md:62` (`map(.text//"")`).

### 2026-07-08 — sessions: 07-03T10-35, 07-03T18-42, 07-04T22-05, 07-05T14-52, 07-06T07-39, 07-07T07-15, 07-08T06-40

- Offenders: (1) `mcp__godot-docs__godot_docs_get_class` re-fetches **immutable** Godot API docs — same classes pulled repeatedly across the 4 big sessions (Plane ×4, CPUParticles3D ×4, NavigationAgent3D ×3, Viewport/NavMesh/Camera3D ×2), each dump ~20.7k chars (~5k tok). ~11 redundant full-class dumps ≈ 55k+ tok of content that never changes within/across a session. (2) Costliest turns are pure `cache_read` on the standing orchestrator context (top turn $161, 384k cache-read tok) — inherent to long orchestrator runs, NOT convertible.
- Opportunity: cache/memoize `godot_docs_get_class` by class name (docs are pinned to the engine version — deterministic) so a class is fetched at most once; optionally return a member-filtered view instead of the full class dump. → **TASK (owner:user)** [id `godot-docs-memoize`, apply via `/token-audit-fix godot-docs-memoize`]: "Memoize godot-docs MCP class lookups (immutable → fetch each class once); optional member-filtered view. Replaces ~11+ redundant 20k-char class dumps/session ≈ 55k+ tok." — _mcp**ui**tasks board not reachable from terminal session; task recorded here for the human to file._
- Discarded (checked, not offenders): `tools/validate.sh` runs 63/196/96/21× but output is already compact (~72 chars, "validate: OK"/PASS lines) — no win. Heavy same-file re-Reads (outpost_alpha.tscn ×56, player.tscn ×50) are legitimate — files mutate between edits, so a re-read reflects current state; not deterministically replaceable. Agent dispatches (26–53/session) are all judgment-heavy game work (build FSM, playgrade, design) — correct agent use.
- Cross-ref: metric direction "tokens per **accepted change**, not total tokens" filed as framework-audit `D9-tokens-per-accepted-change` (numerator = usage.js; denominator = promotions.json/tasks.json). This audit's per-turn totals feed that ratio once the denominator is wired.
- Process note: `jq` tool-result extraction for Bash commands is corrupted by multi-line heredocs (uniq counts physical lines, not commands) — the reliable size signal is **aggregating tool_result char-length by tool name** (map tool_use_id→name, sum lengths). That one query surfaced the godot-docs offender the freq counts hid; recommend adding it as the primary step-3 sweep. Also: `mcp__ui__tasks` is unavailable in a plain terminal session — step 6 should note the ledger is the fallback sink.

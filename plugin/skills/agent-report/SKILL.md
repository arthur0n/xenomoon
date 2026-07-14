---
name: agent-report
agents: [builders, godot-playtester]
domain: universal
description: The agent→orchestrator handoff protocol. A backgrounded worker's relayed result string truncates on long, tool-heavy turns, so the handoff is an artifact, not a string — the worker Writes its full report to a file, and the orchestrator reads that file directly. Load this whenever a task asks you to hand off a structured report to another agent. Any agent doing background work that must be handed off uses it — not only builders. Defines the report contract the writer follows.
---

# Handoff Report

A long background worker's relayed `result` gets clipped (the tail is lost) — so **the handoff is a FILE, not your result string**. Write the report to disk; the orchestrator reads that file, never your raw result.

`caveman` applies to everything here — the report file and the summary. Compress; fragments OK; identifiers/paths/errors exact.

## Producer — you built something, now hand off

Your **last action** is to **Write your full report** to the handoff path the orchestrator gave you (e.g. `.xenodot/handoffs/<slug>.md`). If no path was given, use `.xenodot/handoffs/<task-slug>.md` (kebab from the task) and name it in your result. Write it **last** so it reflects final state — if you die before writing, the file is simply absent and the orchestrator falls back to git/grep verification (graceful, not silent-wrong).

Report fields — **`gate` FIRST** (the tail can clip; lead with the load-bearing fact):

```
gate: PASS | FAIL <layer/why>   — tools/validate.sh (+ godot-verify) output, or why you couldn't run it
files: <path — one-line reason>   (created/modified, repo-relative; one per line)
done: <what works now, one line>
caveats: <gotchas the caller must know, or none>
friction: <improvised pattern / first-attempt verify fail / scope creep / ambiguous skill — one line each, or none>
tool-gap: <a check you improvised or EYEBALLED that a deterministic tool would settle — DRAFT it (see below), or none>
blocked: <exactly what is missing, or omit>
```

(Refactor variant: `gate` carries BEFORE-baseline + AFTER output; `friction`/`caveats` collapse to a `stopped:` line for judgment calls you halted on.)

**Your relayed result = just `<path> — gate PASS|FAIL`.** Nothing more. The path is short, so it survives even a clipped result; the file is the real handoff. Never dump the report into the result.

## Determinism ratchet — flag a tool-gap by DRAFTING it

The harness gets more deterministic over time only if fuzzy work becomes tools. So when you **improvise a one-off pattern no tool covers**, or **EYEBALL something a script could have decided** (a check you ran by hand, an ambiguity you settled by judgment), don't leave it fuzzy for the next run — **draft the tool**:

- Name it in the `tool-gap:` field, and Write the actual draft script to `.xenodot/handoffs/<slug>-tool-<name>.<ext>` (or inline it if a few lines), with a one-line reason + the proposed `tools/<name>` path.
- You can't adopt it yourself (no promote tool). The orchestrator files it via `mcp__ui__promote { kind: "tools" }` for one-approval adoption — a deterministic check graduates into `tools/lib/checks.sh`, a bot/utility into `tools/`.

Hold a real bar: a genuinely one-off judgment is `friction:` (or nothing), not a tool. Draft a tool when the same ambiguity will recur.

## Consumer — the orchestrator reads this file directly

There is no summarizer hop: the orchestrator reads the handoff file itself. That's why `gate` leads and the report stays caveman-tight — a short, `gate`-first file is cheaper to Read than to hand to another agent to compress.

- **Gate only?** The worker's relayed result already carries `<path> — gate PASS|FAIL`; act on that without opening the file.
- **Need the detail** (files/open/caveats/`tool-gap`) → **Read the file**; it's already distilled, so read as much as you need. A `tool-gap:` line means file the promotion (`mcp__ui__promote`).
- **File missing** (worker died before writing) → don't trust a void: verify via git/grep + redispatch.

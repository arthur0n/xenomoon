---
name: pipeline-dispatch
agents: [orchestrator]
domain: universal
description: How to dispatch a step of the flow (plugin/docs/flow/) — resolve the repo, pick the agent and method skill for the step, write the brief, run Codex through its tool, and report one line per step. Load before the first dispatch of a step.
---

# Dispatching a step of the flow

The checklist owns the method of a step; this skill owns the dispatch: which repo, which agent,
what goes in the brief, what comes back.

## 1. Resolve the repo, once

Take it from the project's `CLAUDE.md` (the repo, and which `gh` account to use if the project pins
one). **A `gh` 404 on the repo stops the step** — say so rather than guessing an account, because
guessing writes verdicts to a repo nobody is watching.

## 2. Who runs each step

Checklists are under `plugin/docs/flow/`.

| step      | `subagent_type`                                           | checklist      | method skill                         |
| --------- | --------------------------------------------------------- | -------------- | ------------------------------------ |
| Screening | `junior-analyst`                                          | `screening.md` | `triage-method`                      |
| Direction | `product-owner` (foreground)                              | `direction.md` | `grill`                              |
| Triage    | `junior-analyst`                                          | `triage.md`    | `triage-method`                      |
| Contract  | you                                                       | `contract.md`  | —                                    |
| Design    | `senior-analyst`                                          | `design.md`    | `solution-method`                    |
| Plan      | `senior-analyst`                                          | `plan.md`      | `solution-method`                    |
| Build     | `developer`, then `tester` for the checks                 | `build.md`     | `implement-method`, then `qa-method` |
| Review    | Codex via `mcp__ui__codex`; else a fresh `senior-analyst` | `review.md`    | — / `adversarial-review`             |
| Fix       | `developer`, then the same reviewer                       | `fix.md`       | `implement-method`                   |
| Commit    | you                                                       | `commit.md`    | `commit-method`                      |
| Publish   | `senior-analyst`                                          | `publish.md`   | `push-method`                        |
| Proof     | `uat-runner`                                              | `proof.md`     | the pack's UAT lane                  |

One builder at a time: builders share one working tree, so two only when their file scopes are
stated disjoint in each brief. Triage is read-only.

## 3. The brief

It names the checklist path, the method skill, the issue and the repo, and nothing the checklist
already says:

> _"Design for #42 in owner/repo — follow `plugin/docs/flow/design.md`, run the `solution-method` skill."_

A re-check after a fix says so: _"Re-check after fix round 2 on #42 — read only the fix and its
callers; the earlier verdict does not count, run again."_

## 4. Codex

**Only through the `mcp__ui__codex` tool**, never your own Bash: the full review stays out of your
context and a receipt comes back. A tool missing in an install is a setup problem to report. In a
git worktree pass `cwd`, or the review judges the main checkout (the receipt's `tree:` line says
which was reviewed).

**Which kind** (verified in `ui/server/mcp-tools/codex-tool.js`):

- **Review** → `kind:"audit"`, with the fixed numbered list of attacks from `review.md` (plus the
  domain's usual suspects) as `focus`. It is the only kind that enumerates every finding.
- **The re-check after a fix** → `kind:"audit"` with `only`: the open findings, the fix and the
  callers of what it changed. `only` is a restrictive scope: nothing outside it is read or reported.
- **The attack on the design** → `kind:"adversarial-review"` with `design`: the text of the
  confirmed design, as the `senior-analyst` wrote it on the issue. No file in the tree is needed.
- `kind:"review"` ignores `focus`: not used by the flow.

**Receipts.** One that opens `PARTIAL —` is not a verdict yet: dispatch `xenomoon:handoff-summarizer`
on the named path and map from its answer, never read the file yourself. One that opens
`DEGRADED —` is not evidence: report the exit code and stderr, map nothing, post nothing.

**Mapping.** Codex says `approve` / `needs-attention`; the lane says `pass` / `changes`. You cannot
comment on an issue: dispatch `senior-analyst` with the receipt ("post this Codex receipt as the
review comment, do not review") and it posts ONE comment `## 🔎 REVIEW — pass|changes` with the
`review-verified: <sha>` and `review-content: <fingerprint>` markers and the label. Never the reviewer's own word, which the gate cannot
read.

## 5. Report

One line per step: the step, the result, what goes next. **A deviation from the Design is the
headline**, before files and checks: it is the one part nobody reviewed. **A label that failed to
apply is reported**, never swallowed.

## 6. Literal structure

Write tracker prose in the project's language (English when it states none). Code reads these as
written, so they are never translated: `## 🔎 REVIEW — pass|changes`, `## 🧪 QA — PASS`, the
`review-verified:` / `review-content:` / `review-changes-at:` / `qa-verified:` / `qa-content:` markers, the evidence headings
`## 🔎 CODEX REVIEW` / `## 🔎 INTERNAL REVIEW`, and every `qa:*` / `review:*` / `uat:*` label.

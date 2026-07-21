---
description: Interview → one-page PRD in design/ for a feature or vague brief, then link it on the issue
argument-hint: "<what you want, or an issue#> — the feature/intent to design"
allowed-tools: Bash, Agent, Read, Grep, Glob
---

Trigger for the `designer` agent (opus). It interviews you, captures product intent +
business rules verbatim, and writes ONE small PRD to `design/<slug>.md`. Use it BEFORE
implementing anything non-trivial — a feature, a vague brief ("we want X", "we don't use
Y, do Z"), or work too big to build and verify in one step. The agent is the stable core;
this command is the trigger + the GitHub linkage.

Request / issue: `$ARGUMENTS`

## Foreground only

**Never background this.** The designer round-trips forms with you (`mcp__ui__form`) — a
backgrounded run can't pause for your answers and stalls. Spawn it in the foreground and
let it interview.

## Steps

1. **Resolve the repo:** use `{{REPO}}`; if it wasn't substituted, run
   `gh repo view --json nameWithOwner -q .nameWithOwner`. Use the active `gh` account (a
   project-specific account, if any, is documented in `CLAUDE.md`). If a `gh` call 404s on
   the repo, stop and tell me.

2. **Resolve the target.** If `$ARGUMENTS` is (or names) an issue number, read the issue
   for context first (`gh issue view <N> -R {{REPO}}`). Otherwise the arguments are the raw
   brief. Either way, the designer explores the repo before asking anything.

3. **Spawn one `designer` agent** (Agent tool, `subagent_type: "designer"`), in the
   **foreground**, with the brief (and issue number if any). It interviews via
   `mcp__ui__form`, captures business rules verbatim, may propose a human-gated addition to
   the project `CLAUDE.md` `## Business rules / product facts` block, and writes
   `design/<slug>.md`.

4. **Link the PRD on the issue** (the command owns this GitHub step; the designer stays
   domain-neutral). Once the PRD lands:
   - If `$ARGUMENTS` referenced an existing issue → **update that issue**: add a
     `**PRD:** design/<slug>.md` line near the top of the body and inline the PRD's
     **Acceptance** block, then add the `design` label:
     `gh issue edit <N> -R {{REPO}} --body-file /tmp/design-<N>.md --add-label "design"`
   - If there was no issue and the work warrants tracking → **open one**:
     `gh issue create -R {{REPO}} --title "<PRD title>" --body-file /tmp/design-<slug>.md --label "design"`
     with `**PRD:** design/<slug>.md` + the Acceptance block in the body.
   - If the slice is trivial and needs no tracker entry, skip the issue — say so.
     If `gh issue edit`/`create` fails on a missing `design` label, note it and tell me to
     create it — don't silently drop it.

5. **Report** the PRD path, the ordered slice(s) with the domain each touches, any open
   questions the designer left, and the issue number/URL it linked or opened. Then offer
   the next move: agreed small slice → `/implement`; a genuine defect surfaced instead →
   `/analyze`.

## Notes

- **Intent goes here, not to `/analyze`.** A vague brief or a "how it should behave"
  statement is a design question — never let a builder or the analyst start from it. The
  analyst investigates SYMPTOMS; the designer captures INTENT.
- The designer never names a builder agent — it names the **domain** each slice touches;
  routing each slice to its owner is the orchestrator's call.
- Pipeline: `/feedback` → `/design`? → `/analyze` → `/implement` → `/qa` → `/audit` →
  `/commit` → `/build`.

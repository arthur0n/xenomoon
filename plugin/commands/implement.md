---
description: Implement a solution-ready issue — build the `## 🔬 ANALYSIS` spec, prove it with the project's validate/build/test, leave it uncommitted. Stage 3 of the pipeline.
argument-hint: "[issue# | empty to sweep solution-ready] [--force]"
allowed-tools: Bash, Agent, Read, Grep, Glob
---

Trigger for the `developer` agent — stage 3 of the pipeline
(**triage → solution → implement → verify → human**). The agent is the stable core; this command is
just the trigger.

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo** from the project's `CLAUDE.md` (repo + which `gh` account). A `gh` 404 →
   stop and say so rather than guessing an account.

2. **Parse `$ARGUMENTS`:**
   - A number → implement that one issue.
   - Empty → **list** issues that are `solution-ready` and not yet `implemented`, and ask which —
     do not auto-implement a queue.
   - `--force` → re-implement even when `implemented` is present.

3. **Dispatch the agent** with the Agent tool, `subagent_type: "developer"`. **Put the repo in the
   brief** with the issue number and force flag — e.g. _"Implement issue #42 in owner/repo.
   force=false."_ Its first action is a label-only gate, so it must not open a project file to learn
   where the issue lives. The brief carries pointers, never a re-specification of the spec: the
   ANALYSIS comment on the issue IS the spec, and restating it in the brief is how the two drift.
   - **ONE implementer at a time.** Builders share one working tree — two in parallel clobber each
     other. Concurrency is safe only for genuinely disjoint file scopes, stated in each brief.

4. **Report.** One line per issue: `# | files changed | validate/build/test | regression test red→green? | url`.

## Notes

- **The change stays uncommitted.** That is correct and load-bearing: QA runs against the working
  tree, and the commit stage lands it only after the gates pass.
- **A deviation from the spec is a headline, not a footnote.** If the agent reports it built
  something different from what the ANALYSIS said, that difference has not been reviewed by
  anything — surface it before moving on.
- **Never report the issue as fixed.** Done is deploy-gated; an implemented change is awaiting
  `/qa` → `/audit` → `/commit` → deploy.
- If the agent stops because there is no spec, that is the pipeline working: send the issue through
  `/solution` first.

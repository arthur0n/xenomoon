---
description: Mechanical sweep of an implemented change — each touched package's own gates verbatim, plus diff and commit hygiene. Returns QUICK-PASS or a numbered FIX list. Sets no labels.
argument-hint: "[issue# | empty for the working tree]"
allowed-tools: Bash, Agent, Read, Grep, Glob
---

Trigger for the `junior-analyst` agent in its **`gate-sweep`** lane — the cheap check between
implement and the adversarial review.

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo** from the project's `CLAUDE.md`. A `gh` 404 → stop and say so.

2. **Dispatch** with the Agent tool, `subagent_type: "junior-analyst"`, naming the lane in the
   brief: _"Sweep issue #42 in owner/repo — run the `gate-sweep` skill."_ The lane IS the skill, so
   the brief must name it; without it the agent has no way to know which checklist you meant.

   **With no issue number**, the subject is the **working tree as it stands** — say so in the brief
   (_"Sweep the uncommitted working tree in owner/repo"_) and give it the issue only if one is
   obvious from the branch. The gates and the diff hygiene run identically; only the "does this file
   belong to THIS change" question loses its reference, so the agent reports scope doubts instead of
   asserting them.

3. **Report** the verdict verbatim: `QUICK-PASS` with the gates and their counts, or the numbered
   FIX list with `path:line`.

## Notes

- **This is why you do not run the gates yourself.** The orchestrator running a package's validate
  is a verification nobody independent performed — and the session denies build/test commands in the
  main loop for exactly that reason. Dispatch it.
- **It sets no labels.** `qa:*` belongs to `/qa`, `review:*` to `/audit`. A sweep that stamped a
  verdict label would let a mechanical pass look like a reviewed one.
- **A FIX list goes straight back to `/implement`** — it is a list of concrete, cheap corrections,
  not a judgement about whether the fix is right.
- If the sweep says something needs a heavyweight read (auth, money, data scoping, prompts), that is
  a routing signal for `/audit`, not something the sweep should attempt.

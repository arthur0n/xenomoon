---
description: The fresh look before the PR, after QA — judge the delivery against the DESIGN, name what the chain dropped, and say whether it is coherent as one PR. Adds no gate label.
argument-hint: "[issue# | PR#]"
allowed-tools: Bash, Agent, Read, Grep, Glob
---

Trigger for the `senior-analyst` agent in its **`pre-pr-review`** lane — the last look before a
change becomes a pull request.

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo** from the project's `CLAUDE.md`. A `gh` 404 → stop and say so.

2. **Run it AFTER `/qa` has passed.** Before that there is nothing settled to judge, and this lane
   deliberately does not re-run gates or re-hunt for defects — those stages own that.

3. **Dispatch** with `subagent_type: "senior-analyst"`, naming the lane: _"Pre-PR review for issue
   #42 in owner/repo — run the `pre-pr-review` skill."_

   Given a **PR number** instead, resolve it to its issue first —
   `gh pr view <N> -R <repo> --json number,title,body,baseRefName,headRefName` — because the design
   this lane judges against lives on the ISSUE, not the PR. Pass both to the agent, and tell it the
   base branch so it diffs against the PR's base rather than guessing. A PR that references no issue
   is worth saying out loud: the lane can still read it, but with nothing agreed to judge it against,
   its Acceptance and DROPPED answers are opinion, and the report must label them as such.

   With **no argument at all**, say what you need rather than picking a target for the human.

4. **Report** the verdict: `ready` / `not-ready`, what it confirmed delivered, what it found
   dropped, anything in the diff nobody asked for, and what the human must do before merge.

## Notes

- **This stage exists because every earlier one judged against the stage before it** — the
  implementer against the spec, the sweep against the gates, the audit against the diff, QA against
  the tests. All can pass while the delivery still misses what was agreed, because nobody re-read
  the design with the finished work in hand.
- **Its most valuable output is what was DROPPED** — a WATCH item, a caveat, a follow-up someone
  promised. Those vanish between stages precisely because each one assumed another caught it.
- **No new label.** The commit gate's contract stays `qa:pass` + `review:pass`; this adds judgement,
  not another sticker. `not-ready` routes back to `/implement`, or to the product owner when the gap
  is a decision rather than code.
- If it reports a code defect the adversarial review missed, treat that as a signal about the
  pipeline — not just about this change.

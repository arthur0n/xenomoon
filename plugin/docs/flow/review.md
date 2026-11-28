# Review

Agent: Codex, through the Codex tool. When Codex is not turned on in the project: a fresh `senior-analyst` that wrote none of the design, the plan or the code. Job: one full review of the whole change, with one list of findings. It runs once per issue.

## Do

- `[judgment]` Read the contract and the design first, the diff second. Read every hunk of the actual diff, not its description.
- `[judgment]` The project's own rules come before general doubts.
- `[judgment]` A finding names a concrete hole at `path:line` and its consequence. Unease is not a finding. A matter of taste is not a finding.
- `[judgment]` What a tool already checks is not reviewed.
- `[check]` To see what the change affects, use `graphify affected "<file>"`, not a text search.
- `[code]` Codex runs only through its tool. In a worktree pass `cwd`. A result that opens with `PARTIAL —` is not a verdict yet, and one that opens with `DEGRADED —` is not evidence.

## The fixed list of attacks

The list is frozen while an issue is in the flow. Every attack is answered: a finding, or "tried, nothing".

1. Try to find a contract line that the change does not deliver. Quote the line.
2. Try to find a contract line that the change delivers wrongly. Quote the line.
3. Try to find something built that no line of the contract or the design asked for. Quote the nearest line.
4. Try to find an edge case or a warning from the design that the change quietly dropped.
5. Try to make one user's request return another user's data.
6. Try to get past the login check, or find login logic outside its one place.
7. Try to make an error vanish, or raw input reach the database or a page.
8. Try to make the new test pass on the code from before the change.
9. Try to find a migration that loses data, lands out of order, or arrives without its code, or code that reaches production before its migration is applied.
10. Try to show the change is not one story that can be reverted alone.
11. Try to show the rollback in the design cannot undo this change as built.

## For every finding

- `[judgment]` Did this change cause it, expose it or make it worse? Write yes or no, with the evidence.
  - Yes → Fix.
  - No → one line on the owner's list. No fix, no new issue.
  - The builder disagrees with a yes → it stays a yes. The disagreement goes on the owner's list.

## The pass

Nothing left to fix (no finding at all, or every finding went to the owner's list) → write the pass. The commit hook reads these lines exactly as written:

- The tester posts a comment with the line `## 🧪 QA — PASS`, the line `qa-verified: <output of git rev-parse HEAD>` and the line `qa-content: <output of issuekit fingerprint>`, and sets the label `qa:pass`.
- The review comment carries the line `## 🔎 REVIEW — pass`, the line `review-verified: <the same sha>` and the line `review-content: <the same fingerprint>`, with the label `review:pass`. Write `pass`, never the reviewer's own word. Who posts it: the `senior-analyst`. When Codex did the review, the orchestrator hands it the receipt and it posts the receipt as given, without reviewing again (the orchestrator has no tool to comment on an issue).
- `[code]` The pass belongs to the exact content reviewed. `issuekit fingerprint` prints the content fingerprint of the repo (HEAD and the whole working tree, `.xenomoon/` left out). The commit hook compares it with both content marks. A blocking verdict carries neither `-verified` nor `-content`.

## Next

Findings to fix → Fix. Pass written → Commit.

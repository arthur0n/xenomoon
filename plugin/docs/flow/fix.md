# Fix

Agents: `developer`, then the same reviewer as in Review. Job: close the findings of the review. The open findings are the fix list, and nothing else is.

## The budget

- `[code]` Three rounds per issue. The flow task counts them: the move into Fix starts round one, and a move from Fix to Fix starts the next. A fourth is refused and the issue goes to Waiting for the owner. Name the round in the brief.
- Rounds one and two are fixes.
- Round three is not a fix. It is a diagnosis.

## A fix round (one and two)

- `[judgment]` The developer fixes the open findings. The Build rules hold: no weakened check, no new dependency, no growth of the change.
- `[check]` The tester runs the project's checks again for every package touched.
- `[code]` The reviewer reads only the fix and the code it affects (the callers of what changed), not the whole change again. With Codex this is the `only` field of the tool. It answers two questions: is the finding closed, and did the fix break something?
- `[judgment]` The earlier pass or block comment does not count for the new content. Run the re-check even when a skill says "already done": tell it to run again.
- All closed and nothing broken → write the pass, as in Review, with the new content fingerprint. → Commit.

## Round three: the diagnosis

- `[judgment]` Is this a gap in the design (it missed a case), or a bad design?
  - A gap → back to Design, for that line only. The budget does not start again: after the new build, a finding that is still open waits for the owner.
  - A bad design → state Waiting for the owner, with the open findings.
- `[judgment]` Write one lesson line: what would have caught this earlier. Name where it goes: a mechanical mistake → a check; a judgment call → one line in the standards the reviewer reads. It goes to the project's lessons queue. It becomes an issue only on the owner's word.

## Next

Pass written → Commit. Budget used → Waiting for the owner.

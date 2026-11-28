# Publish

Agent: `senior-analyst` with the push skill. Never the agent that wrote the code. Job: send the change as far as the contract allows, through the project's own path. Nothing here closes the issue.

## Do

- `[judgment]` Read the "How far" line of the contract: pull request opened, merged, or deployed.
- `[judgment]` A move counts with what it sets off by itself. Find out first whether a merge deploys in this project. If it does, a merge is a deploy and needs the approval of a deploy.
- `[code]` `issuekit push-check`, `issuekit pr merge` and `issuekit promote` compare the move with the "How far" line. A STOP → state Ready, not published. Only the owner changes the line.
- `[judgment]` A `git push` or a merge typed by hand is held by the project's approvals (`policy.push`, `policy.merge`), not by the contract. Use these commands.
- `[check]` One call to `issuekit push-check`, then obey it. Exit 1 → stop and quote its STOP lines. Exit 0 → run the one command it prints, exactly.
- `[code]` The push is a bare `git push <remote> <branch>`. No force, no tags, no chained commands.
- `[code]` A push that reaches the deploy branch follows the project's push setting (ask, or allow).
- `[judgment]` A problem is flagged, never fixed here. A dirty tree is flagged and not touched.
- `[judgment]` The pull request carries the before and after evidence, and what the Design said about undoing the change. It says `Refs #N`, never Closes.
- `[judgment]` Never deploy by hand. Deploy is the project's CI after the push.
- `[check]` The change has a migration → it reaches production the way the confirmed Design said, with no new question to the owner. Check that the run applied it before the code. Not applied → a blocker: state Waiting for the owner, with the step that is missing. Never a question about what to do.
- `[check]` After a push to the deploy branch, watch the run and report which step failed, if one did. "Merged" is not "shipped": check that the run that finished is the one of this change.
- `[judgment]` Keep the issue open. If the project closes issues automatically on deploy, say so before the push: only Proof may close it.

## Next

Deployed → state Waiting for the proof → Proof. Not allowed further → state Ready, not published.

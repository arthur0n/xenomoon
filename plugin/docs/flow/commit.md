# Commit

Agent: the orchestrator. The commit hook decides. Job: record the change. It never publishes.

## Do

- `[check]` `git status --porcelain` before staging. A file that is not part of this change means stop, not stage.
- `[code]` The content is the one that got the pass. The hook compares the fingerprint of the working tree with the `qa-content:` and `review-content:` marks. Different → the hook denies the commit, cancels the pass and moves the issue to Fix (one fix round, once per refused content). An issue in a waiting state, or with no flow task, is not moved; the refusal says where it is. Equal but something is not staged, or a file under `.xenomoon/` is staged → the hook asks the human.
- `[check]` Stage everything first, then give the commit in a command of its own. The hook compares when the command is given, not at the end of the commit; what a project's own pre-commit hooks change is not compared.
- `[code]` Commit with `issuekit commit <N> -m "<type>: <summary> (#N)"`. It asks the hook, commits and sets the labels in one call.
- `[code]` The message carries `(#N)`, never `Closes #N`. One commit per command.
- `[judgment]` Do not judge the hook's answer in advance by reading labels. Ask the tool.
- `[judgment]` A refusal ends one of two ways: go to the step it names, or stop for the owner. Never rephrase the command, never drop `(#N)`.
- `[judgment]` Never commit while a builder works on the same tree.
- `[judgment]` Report the sha, the subject and the labels. Say it loudly when a label did not land.

## Stop

None. When the commit hook asks, the owner answers the hook; that is not a stop of the flow.

## Next

Publish.

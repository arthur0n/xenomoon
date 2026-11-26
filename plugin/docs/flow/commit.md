# Commit

Agent: the orchestrator. The commit hook decides. Job: record the change. It never publishes.

## Do

- `[check]` `git status --porcelain` before staging. A file that is not part of this change means stop, not stage.
- `[code, not built]` The content is the one that got the pass. Until code does it: run `git diff HEAD | shasum` and compare it with the fingerprint in the two pass comments. Different → the pass is cancelled, go back to Fix.
- `[code]` Commit with `issuekit commit <N> -m "<type>: <summary> (#N)"`. It asks the hook, commits and sets the labels in one call.
- `[code]` The message carries `(#N)`, never `Closes #N`. One commit per command.
- `[judgment]` Do not judge the hook's answer in advance by reading labels. Ask the tool.
- `[judgment]` A refusal ends one of two ways: go to the step it names, or stop for the owner. Never rephrase the command, never drop `(#N)`.
- `[judgment]` Never commit while a builder works on the same tree.
- `[judgment]` Report the sha, the subject and the labels. Say it loudly when a label did not land.

## Stop

In a terminal session: the owner's word before the commit. In a project session: none.

## Next

Publish.

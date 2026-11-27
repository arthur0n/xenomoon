# Proof

Agent: `uat-runner`. Job: confirm it works in production, the way the Design said. This is the only step after which an issue is closed.

## Do

- `[judgment]` Run the proof the Design named. It is something that can be run again (a command, a scripted check), not an agent's word.
- `[judgment]` Read the project's `CLAUDE.md` acceptance command first. It overrides the defaults here.
- `[check]` Run the project's own script only, with its limits already in the config (headless, one worker, no retries, timeouts). No limits → do not run.
- `[judgment]` Never assume an address or a port: ask. Never start the app yourself. Never type a password or automate a sign-in: use the saved session.
- `[judgment]` Keep two answers apart: the product is wrong, or the setup is not ready (app down, session stale, no script). A setup problem is not a failed proof: name the missing thing and its one-line fix.
- `[judgment]` Always give evidence: the step, what was expected, what was shown. On success, name a real element you saw.
- `[judgment]` A hang: let the timeout end it. Never retry in a loop.
- `[check]` Check that what runs in production is this change, not an earlier run.

## The answer

- Works → the `uat-runner` reports it with the evidence and closes nothing. The orchestrator closes the issue and its flow task, and shows the owner's list of outside findings. DONE.
- Does not work → state Proof failed, on the same issue. No new issue. From there the ways on are a fix round, if the budget has one left, or Waiting for the owner. If the Design marked the rollback as safe and the contract allows it, roll back. In every case tell the owner.
- No proof can be run → the issue stays in Waiting for the proof. A generic check does not count.

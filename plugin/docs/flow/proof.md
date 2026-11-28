# Proof

Agent: `uat-runner`. Job: confirm it works in production, as the `Proof:` line of the contract says. Only Proof moves an issue to DONE.

## Do

- `[judgment]` Name the lane skill in the brief to the `uat-runner`.
- `[judgment]` Run what the `Proof:` line of the contract says, with the detail the Design named. A look at a named page through the browser is one way, the project's own test script is another. It is evidence, not an agent's word.
- `[judgment]` Read the project's `CLAUDE.md` acceptance command first. It overrides the defaults here.
- `[check]` Proof by script: run the project's own script only, with its limits already in the config (headless, one worker, no retries, timeouts). No limits → do not run.
- `[judgment]` Never assume an address or a port: take it from the detail the Design named or from the project's `CLAUDE.md`. Neither names it → the setup is not ready: name the missing thing. Never start the app yourself. Never type a password or automate a sign-in.
- `[judgment]` Proof by a look through the browser: use the project's Chrome profile. Its id is `browser.deviceId` in the project's `.xenomoon/settings.json`. A missing or unconnected id is "setup not ready", named with its one-line fix, not a failed proof.
- `[judgment]` Keep two answers apart: the product is wrong, or the setup is not ready (app down, profile not connected, no script). A setup problem is not a failed proof: name the missing thing and its one-line fix.
- `[judgment]` Always give evidence: the step, what was expected, what was shown. A look at a page gives evidence this way. On success, name a real element you saw.
- `[judgment]` A hang: let the timeout end it. Never retry in a loop.
- `[check]` Check that what runs in production is this change, not an earlier run.

## The answer

- Works → the `uat-runner` reports it with the evidence and closes nothing. The orchestrator closes the issue and its flow task, and shows the owner's list of outside findings. DONE.
- Does not work → state Proof failed, on the same issue. No new issue. From there the ways on are a fix round, if the budget has one left, or Waiting for the owner. If the Design marked the rollback as safe and the contract allows it, roll back. In every case tell the owner.
- The `Proof:` line cannot be run → the issue stays in Waiting for the proof. A generic check does not count.
- `Proof: none` → the issue takes the same moves as every issue: Publish, Waiting for the proof, Proof. No agent is dispatched. The orchestrator records on the issue "no proof, the owner's decision", closes the issue and its flow task. DONE.

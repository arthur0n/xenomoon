# Design

Agent: `senior-analyst` writes it. Codex attacks it. Job: the technical shape, on the facts of the code.
The Design owns: the facts read, the files of the change, the path to production, how the result is proved, how it is rolled back.

## Do

- `[judgment]` Treat what Triage left as a starting guess. Open the cited files and verify.
- `[check]` Records before code. Cite only lines you opened.
- `[judgment]` Can the code answer the question? Read the code, do not ask.
- `[judgment]` Read only what settles the design. Do not wander the codebase.
- `[judgment]` Name the exact files and functions. No code patch. Precise enough that the build is mechanical.
- `[judgment]` Keep logic where the project keeps it. Name the edge cases this change meets (who may see what, errors that get swallowed, login).
- `[check]` Check what else depends on the files you change (`graphify affected "<file>"`) before you settle.
- `[judgment]` How it is proved: a test that fails without the change, and the check in production that Proof will run. "Cannot be automated" needs a reason.
- `[judgment]` The path to production: what gets deployed, through the project's CI only. A migration is made with the project's own command, never by hand.
- `[judgment]` How it is rolled back, and whether that is safe to do without the owner.
- `[judgment]` Does a technical fact break a line of the contract (for example a change that cannot be undone, when he approved "deployed")? → ask the owner again, on that line only.

## Stop 1: the owner confirms the design

One line per item: files, approach, proof, path to production, rollback. The project's settings cannot confirm this stop.

## The attack

- `[code]` One attack by Codex on the confirmed design, before any code, through the Codex tool: the design text goes in its `design` field. A degraded result is not evidence: report it, do not use it.

## Stop 2: the owner reads the findings

He says which findings change the design. Nothing is applied before that. No findings → say so and go on.

## Next

Plan.

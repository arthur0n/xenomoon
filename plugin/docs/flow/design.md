# Design

Agent: `senior-analyst` writes it. Codex attacks it. Job: the technical shape, on the facts of the code.
The Design owns: the facts read, the files of the change, the path to production, the technical part of the proof, how it is rolled back.

## Do

- `[judgment]` Treat what Triage left as a starting guess. Open the cited files and verify.
- `[check]` Records before code. Cite only lines you opened.
- `[judgment]` Can the code answer the question? Read the code, do not ask.
- `[judgment]` Read only what settles the design. Do not wander the codebase.
- `[judgment]` Name the exact files and functions. No code patch. Precise enough that the build is mechanical.
- `[judgment]` Keep logic where the project keeps it. Name the edge cases this change meets (who may see what, errors that get swallowed, login).
- `[check]` Check what else depends on the files you change (`graphify affected "<file>"`) before you settle.
- `[judgment]` What proves the issue, and whether a proof is needed, is the `Proof:` line of the contract, the owner's. The Design does not decide it. The Design adds the technical part: the test that fails without the change ("cannot be automated" needs a reason), and what is needed to run what the `Proof:` line asks (the exact address or page, or the exact command).
- `[judgment]` The path to production: what gets deployed, through the project's CI only.
- `[judgment]` A database change is part of the design, in three lines: what changes in the schema and what happens to the rows that exist; which step of the project's CI applies the migration in production, before the code that needs it; how it is undone. Read the project's deploy workflow to answer, do not assume.
- `[judgment]` No step of the project's CI applies a migration → that is a line of this design: add the step to the project's workflow as a piece of this issue. If that step cannot be added, it is a blocker now, before any code: state Waiting for the owner, naming what is missing.
- `[judgment]` A change the old code cannot survive (a column removed or renamed, a meaning changed) does not go out in one deploy. The design cuts it into deploys where each migration works with the code already in production: add first, switch the code, remove last. Each deploy is named in the design.
- `[judgment]` The owner's yes to the design covers the database change and the way it reaches production. No later step asks him again about it.
- `[judgment]` How it is rolled back, and whether that is safe to do without the owner.
- `[judgment]` Does a technical fact break a line of the contract (for example a change that cannot be undone, when he approved "deployed", or a `Proof:` line that cannot be done)? → ask the owner again, on that line only.

## Stop 1: the owner confirms the design

One line per item: files, approach, database change, the technical part of the proof, path to production, rollback. The project's settings cannot confirm this stop.

## The attack

- `[code]` One attack by Codex on the confirmed design, before any code, through the Codex tool: the design text goes in its `design` field. A degraded result is not evidence: report it, do not use it.

## Stop 2: the owner reads the findings

He says which findings change the design. Nothing is applied before that. No findings → say so and go on.

## Next

Plan.

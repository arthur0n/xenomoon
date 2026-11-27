# Build

Agents: `developer` writes the code and its test. `tester` runs the checks and judges the test. Job: the code and its tests, one piece of the Plan at a time. The change stays uncommitted.

## Before the first piece

- `[judgment]` Read the project's `CLAUDE.md` commands and its conventions before you write, not after.

## For each piece (developer)

- `[judgment]` Take the next piece of the Plan, in its order. Build exactly what the Design says: the smallest change, reusing what exists.
- `[judgment]` Something is missing to deliver a line the Design already has (a file it did not name, a step in the project's workflow) → it is part of this work: do it, and name it first in your report.
- `[judgment]` The work would change what the Design decided (another approach, another behaviour, another table) → stop. State Waiting for the owner, with the Design line and the fact that breaks it. There is no third way: no way around it, and no question about something he cannot refuse.
- `[check]` The test for the piece goes red without the code and green with it. A test that passes on the old code guards nothing.
- `[judgment]` Never weaken a check to go green: no skipped test, no disabled lint rule, no wider type.
- `[code]` No new or removed dependency unless the Design names it. The policy refuses it for workers.
- `[judgment]` A schema change: generate the migration with the project's tool, read the SQL, ship it with the code. Never apply it by hand.
- `[judgment]` No secrets, no `.env` values, no hand-edited generated files.
- `[judgment]` One builder at a time on the working tree.

## After each piece (tester)

- `[check]` Run the project's own check commands for every package the piece touched. One green package does not cover another. Never a bare or global compiler.
- `[judgment]` The diff of the piece stays inside the Design line the Plan named for it. Something outside it → the first line of your report.
- `[judgment]` Mark the piece finished on the issue and on the board.

## When it is red

- `[code, not built]` Checks red after a piece → fix once. Still red → state Waiting for the owner, with the red check. Count the one fix on the issue.

## Report

- `[code]` A builder in the background writes its report file last, the `gate:` line first, and answers only `<path> — gate PASS` or `gate FAIL`.

## Next

More pieces → the next piece. None left → Review.

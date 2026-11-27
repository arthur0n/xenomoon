# Plan

Agent: `senior-analyst`, right after its Design is confirmed. Job: cut the work into small pieces.

## Do

- `[check]` Are the project's checks complete and green now, before any change? Run them and read the exit code. Red → state Waiting for the owner, with the red check.
- `[judgment]` One piece = one builder, one task, one way to verify it. Keep coupled work together (a shared change and the places that call it).
- `[judgment]` Each piece leaves the checks green. A split that leaves them red between pieces is the wrong split.
- `[judgment]` Each piece names: the Design line it delivers, what it changes, what must be finished before it, how it is verified. Every Design line has a piece, the way to production included. A piece that no Design line asks for is not planned.
- `[code]` The pieces are tasks on the board (the tasks tool), one task per piece. They are not issues.
- `[judgment]` Save the plan and what is finished on the issue too. The board drops finished tasks.
- `[judgment]` One builder at a time. Two only when their files are clearly separate.
- `[judgment]` Does the work need a new issue? → state Waiting for the owner. He approves it or not.
- `[judgment]` The work turned out bigger than the contract → stop and say so. Never widen it quietly.

## Next

Build. No stop.

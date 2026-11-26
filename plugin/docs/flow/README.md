# The flow of one issue

One issue moves through twelve steps. Each step has one job, its agent and one checklist file. Open the checklist of the step the issue is in, and only that one.

```
Screening → Direction ⇄ Triage → Contract → Design → Plan → Build → Review ⇄ Fix → Commit → Publish → Proof → DONE
```

| Step      | Agent                      | Job                                                     | Checklist      |
| --------- | -------------------------- | ------------------------------------------------------- | -------------- |
| Screening | `junior-analyst`           | Can this issue enter the flow?                          | `screening.md` |
| Direction | `product-owner`            | The goal from the business side, confirmed by the owner | `direction.md` |
| Triage    | `junior-analyst`           | Read the code and bring the facts                       | `triage.md`    |
| Contract  | orchestrator               | Write the issue once, product side only                 | `contract.md`  |
| Design    | `senior-analyst`           | The technical shape, attacked once before any code      | `design.md`    |
| Plan      | `senior-analyst`           | Cut the work into small pieces                          | `plan.md`      |
| Build     | `developer`, `tester`      | The code and its tests, piece by piece                  | `build.md`     |
| Review    | Codex                      | One full review of the whole change                     | `review.md`    |
| Fix       | `developer`, same reviewer | Close the findings of the review                        | `fix.md`       |
| Commit    | orchestrator               | Record the change                                       | `commit.md`    |
| Publish   | `senior-analyst`           | Send it as far as the contract allows                   | `publish.md`   |
| Proof     | `uat-runner`               | Confirm it works in production                          | `proof.md`     |

## How to read a checklist

Every line carries one mark:

- `[code]` a program enforces it or answers it. You cannot get it wrong.
- `[code, not built]` it will be a program. Until then you do it by hand and record the result.
- `[check]` a command you run. Read its exit code, never its text through a pipe.
- `[judgment]` you decide, and you write the reason in one line.

## States where an issue can wait

An issue is in one step or in one of these states, never in two. A state is saved with the exact thing it waits for.

- **Needs information**: facts are missing from the author. Fixed shape: "What we established so far" and "What we still need from you", with specific questions. When the author answers, the work goes on from where it stopped. Nothing is asked twice and no counter starts again.
- **Waiting for the owner**: one named decision is pending. Silence is never a yes.
- **Ready, not published**: built and reviewed. Publishing waits for an approval.
- **Waiting for the proof**: published, not yet confirmed in production.
- **Proof failed**: published and not working.

Only Proof moves an issue to DONE. Done means deployed and confirmed that it is working.

## Rules that hold in every step

- `[judgment]` A blocker that makes the result unusable → state Waiting for the owner. Do not build around it.
- `[judgment]` A new issue is created only on the owner's word. Something you notice on the way is one line on the owner's list.
- `[code, not built]` The step, the state, the visits to Triage, the fix rounds and the files of the change are kept by code. The first piece exists: the tasks tool's op `flow` keeps one task on the board per issue that cleanup never closes. The orchestrator still writes its title by hand, `#N · <step or state> · triage n/2 · fix n/3 · agents n`, at every step change. The comment each agent leaves on the issue is the record of its step.
- `[judgment]` An issue runs under one flow. For an issue on this flow, older routing text does not apply.
- `[judgment]` Write to the tracker in the project's language. Headings, markers and label names are never translated: code reads them as written.

## The owner stops, and nothing else

Direction (he confirms the goal and the decisions), Design (twice: the design, then the findings of the attack), the fix budget used up, a publishing move past what he allowed, and a failed proof. The project's settings may approve only the publishing moves. Everywhere else the work goes on without asking.

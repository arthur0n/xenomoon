# The flow of one issue

One issue moves through twelve steps. Each step has one job, its agent and one checklist file. Open the checklist of the step the issue is in, and only that one.

```
Screening → Direction ⇄ Triage → Contract → Design → Plan → Build → Review ⇄ Fix → Commit → Publish → Proof → DONE
```

| Step      | Agent                      | Job                                                                                        | Checklist      |
| --------- | -------------------------- | ------------------------------------------------------------------------------------------ | -------------- |
| Screening | `junior-analyst`           | Can this issue enter the flow?                                                             | `screening.md` |
| Direction | `product-owner`            | The goal from the business side, confirmed by the owner                                    | `direction.md` |
| Triage    | `junior-analyst`           | Read the code and bring the facts                                                          | `triage.md`    |
| Contract  | orchestrator               | Write the issue once, product side only                                                    | `contract.md`  |
| Design    | `senior-analyst`           | The technical shape, attacked once before any code (a small change: short form, no attack) | `design.md`    |
| Plan      | `senior-analyst`           | Cut the work into small pieces                                                             | `plan.md`      |
| Build     | `developer`, `tester`      | The code and its tests, piece by piece                                                     | `build.md`     |
| Review    | Codex                      | One full review of the whole change                                                        | `review.md`    |
| Fix       | `developer`, same reviewer | Close the findings of the review                                                           | `fix.md`       |
| Commit    | orchestrator               | Record the change                                                                          | `commit.md`    |
| Publish   | `senior-analyst`           | Send it as far as the contract allows                                                      | `publish.md`   |
| Proof     | `uat-runner`               | Confirm it works in production                                                             | `proof.md`     |

## How to read a checklist

Every line carries one mark:

- `[code]` a program enforces it or answers it. You cannot get it wrong.
- `[code, not built]` it will be a program. Until then you do it by hand and record the result.
- `[check]` a command you run. Read its exit code, never its text through a pipe.
- `[judgment]` you decide, and you write the reason in one line.

## States where an issue can wait

An issue is in one step or in one of these states, never in two. A state is saved with the exact thing it waits for.

- **Needs information**: facts are missing from the author. Fixed shape: "What we established so far" and "What we still need from you", with specific questions. When the author answers, the work goes on from where it stopped. Nothing is asked twice and no counter starts again.
- **Waiting for the owner**: the work cannot go on without him. Either one named decision he can really take (he could say no, and the work would differ), or one named thing that is missing and only he can give. A missing thing is stated, never dressed as a question. Silence is never a yes.
- **Ready, not published**: built and reviewed. Publishing waits for an approval.
- **Waiting for the proof**: published, not yet confirmed in production.
- **Proof failed**: published and not working.

Only Proof moves an issue to DONE. Done is deployed and confirmed working, or deployed when the owner decided no proof is needed.

## Rules that hold in every step

- `[judgment]` A blocker that makes the result unusable → state Waiting for the owner, naming the one missing thing. Do not build around it.
- `[judgment]` Outside the owner stops below there is no question to the owner. Work inside what the confirmed Design approved: do it. Work that cannot go on: the blocker rule above. Never ask him to confirm something he cannot refuse.
- `[code]` A question about the work of an issue names the issue: `issue: <N>` on `mcp__ui__ask` and `mcp__ui__form`. The tool refuses it unless the issue is at Direction, Design, Needs information, Waiting for the owner, Ready not published or Proof failed; nothing is filed or shown, and the refusal says where the issue is and what to do instead. Each refusal leaves one line in the session log; after it, write in your report or your comment on the issue what you did instead of asking. A question with no issue, or an issue with no flow task, passes. The SDK's `AskUserQuestion` of the main session carries no issue and is not checked: for it the rule above stays judgment.
- `[judgment]` A new issue is created only on the owner's word. Something you notice on the way is one line on the owner's list.
- `[code]` The step, the state, the visits to Triage and the fix rounds are kept by the tasks tool's op `flow`: one task on the board per issue, moved once at every step change. The tool refuses a move this flow does not have and a round over a budget, and names where the issue goes. Only the owner removes that task. The comment each agent leaves on the issue is the record of its step.
- `[code, not built]` The files of the change are kept by code. Until then the Design names them and the review reads the real diff.
- `[judgment]` An issue runs under one flow. For an issue on this flow, older routing text does not apply.
- `[judgment]` Write to the tracker in the project's language. Headings, markers and label names are never translated: code reads them as written.

## The owner stops, and nothing else

Direction (he confirms the goal and the decisions), Design (twice: the design, then the findings of the attack; once for a small change, in the short form of `design.md`), the fix budget used up, a publishing move past what he allowed, and a failed proof. The project's settings may approve only the publishing moves. Everywhere else the work goes on without asking.

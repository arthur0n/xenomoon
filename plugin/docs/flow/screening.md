# Screening

Agent: `junior-analyst`, short form. Job: decide if the issue can enter the flow. A few minutes. No deep reading of the code: that is Triage.
Runs for every issue, whoever wrote it.

## Do

- `[check]` Settle the repo and the `gh` account first. A 404 or the wrong account stops the step: never guess.
- `[code]` Search open and closed issues for the same symptom (`issuekit search`). A closed one whose symptom is back is a regression: say so.
- `[judgment]` Is it a duplicate of an open issue? Yes → state Waiting for the owner, with the link. The owner decides what happens to it.
- `[judgment]` Is it real and understandable? No → state Needs information. Say exactly what is missing, never "needs more info".
- `[judgment]` What kind is it: something broken against how it works today, or how it should behave? Never file a wish as a bug. A note that mixes both is two things: say so.
- `[judgment]` Does it fit one issue? The unit is what one session can close. No → report to the owner with the split. He decides.
- `[code]` Does it belong to an open epic? Look with the epic tool (`op:"list"`) before treating it alone.
- `[judgment]` Do not invent facts. Leave a field empty rather than fill it.

## Leave on the issue

A few lines: duplicate or not (with what was searched), kind, fits one issue or not, what is missing if anything.

## Next

Direction. Stop only when a line above said no.

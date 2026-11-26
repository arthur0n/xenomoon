# Direction

Agent: `product-owner`, foreground only (its questions pause for an answer). Job: the goal of the issue from the business side, confirmed by the owner.
Facts are your job. Decisions are the owner's.

## Do

- `[judgment]` Read first: the issue and its comments, the project's `CLAUDE.md` index, its business rules, what Screening left. Never ask what the repo can answer.
- `[judgment]` Is enough known to ask good product questions? No → Triage, then come back.
- `[code, not built]` At most two visits to Triage. After that → state Needs information.
- `[judgment]` Ask only what the owner alone can decide. One question per round, your recommendation first, options checked against the code, and a free answer.
- `[judgment]` No technical questions to the owner (tables, modules, routes). Those belong to Design.
- `[code]` Every question goes through a tool, never plain chat. One decision, one channel.
- `[judgment]` Quote a business rule word for word. A paraphrase drifts.
- `[judgment]` A loose word names the existing thing. It is not an order to rename or rebuild it.
- `[judgment]` Push back on scope. Extras go on a "Later" list, not into this issue.

## Stop: the owner confirms

One message, one line per item, his words quoted beside each:

1. The goal.
2. Each product decision.
3. What done is.
4. How far the work may go without him: pull request opened, merged, or deployed. The default comes from the project's settings.

A line he did not confirm is not a decision: ask again or drop it. The project's settings cannot confirm this stop.
Owner away → state Waiting for the owner, with the lines to confirm.

## Next

Contract.

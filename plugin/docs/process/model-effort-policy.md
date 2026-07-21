# Model / effort policy — every agent, every domain

The owner's standing rules for what model and effort an agent may declare. Enforced by
`npm run check:agents` (`ui/server/cli/agents-lint.js`) across the CORE plugin AND every
domain pack. The live roster is `docs/ROSTER.md`.

## The four rules

1. **sonnet is allowed ONLY for** (a) internal quick research, or (b) a specific, well-planned
   activity — executing a precise handoff/PRD where the judgment was already spent upstream.
   Open-ended judgment (root-causing, design, review) never runs on sonnet.
2. **opus always runs `effort: high`.** Opus exists for judgment work; a throttled opus is the
   worst of both prices.
3. **Two agents on the SAME model** are justified only by **parallel execution** or a
   **highly-specialized prompt** that substitutes for loading skills. Otherwise consolidate:
   one agent + skills. New capability lands as a SKILL into an existing agent; a new agent is
   the last resort.
4. **Cheaper model where judgment is barred.** If an agent's prompt forbids judgment calls
   (mechanical transforms, scripted runs, distillation), push it down the ladder.

## The ladder

- **opus / high** — judgment: design, investigation/falsification, adversarial review, research
  that ends in an adopt/reject call.
- **sonnet / medium** — planned execution and mid-weight research: implementing a written
  handoff, building a checklist from written Acceptance.
- **sonnet / low** — lookup and scripted runs: doc lookups, capped test execution.
- **haiku / low** — mechanical, no-judgment work: summarize a file, apply a listed edit.

## Declaring exceptions

- `sonnet` + `effort: high` requires an `<!-- effort-justification: ... -->` note in the agent
  body naming why (lint FAILS without it).
- Same-model multiplicity should carry a `<!-- roster-justification: ... -->` note naming the
  parallel or specialization case (lint WARNS without it).

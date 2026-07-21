# Agent roster — model · effort · when used

The one place to see what each agent costs and when it runs. Policy:
`plugin/docs/process/model-effort-policy.md` (enforced by `npm run check:agents`;
print the live table with `node ui/server/cli/agents-lint.js --table`).

## CORE (`plugin/agents/` — loads in every session)

| agent                 | model  | effort | when used                                                                                                                  | cost expectation                                 |
| --------------------- | ------ | ------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| designer              | opus   | high   | Vague/feature/intent request → interview → one-page PRD (`design/<slug>.md`) + business-rules capture. Never backgrounded. | High per run, rare — runs once per feature slice |
| skill-researcher      | opus   | high   | Missing-skill gap → research → adopt/reject recommendation (human-gated)                                                   | High, rare                                       |
| transcript-researcher | opus   | high   | Harvest a saved transcript into a durable digest                                                                           | High, rare                                       |
| cli-researcher        | sonnet | medium | Quick capability/tooling research (transport pick, tool definition)                                                        | Medium, occasional                               |
| handoff-summarizer    | haiku  | low    | Distill a builder's handoff file to ≤5 lines                                                                               | Trivial, frequent                                |

## Webapp domain (`domains/webapp/plugin/agents/`)

| agent      | model  | effort | when used                                                                                                             | cost expectation                                        |
| ---------- | ------ | ------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| analyst    | opus   | high   | Bug/symptom issue: investigate → falsify → root-cause verdict + fix design, ONE `ANALYSIS` comment + `analyzed` label | High per issue, the main investigation spend            |
| developer  | sonnet | high   | Implement the ANALYSIS/PRD spec, add the named regression test, leave uncommitted                                     | Medium-high per issue (effort-justified: owner mandate) |
| tester     | sonnet | medium | `/qa` gate: re-run gates + judge the regression test against Acceptance                                               | Medium, per implemented issue                           |
| reviewer   | opus   | high   | `/audit` adversarial review of the uncommitted diff (Codex replaces it when enabled)                                  | High — skippable for sev:low/cosmetic                   |
| uat-runner | sonnet | low    | `/uat` capped Playwright acceptance (POC-first, out-of-band)                                                          | Low, batch cadence                                      |

Deleted (2026-07-21 redesign): `bug-triage` + `senior-dev` → merged into `analyst`;
`committer` → direct hook-gated `/commit`.

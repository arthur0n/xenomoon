# Agent roster — model · effort · when used

The one place to see what each agent costs and when it runs. Policy:
`plugin/docs/process/model-effort-policy.md` (enforced by `npm run check:agents`;
print the live table with `node ui/server/cli/agents-lint.js --table`).

## CORE (`plugin/agents/` — loads in every session)

| agent              | model | effort | when used                                                                                                                                                                                                                                                                                     | cost expectation                                 |
| ------------------ | ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| product-owner      | opus  | high   | Vague/feature/intent request → interview → one-page PRD (`design/<slug>.md`) + business-rules capture. Never backgrounded.                                                                                                                                                                    | High per run, rare — runs once per feature slice |
| researcher         | opus  | high   | The ONE research role — mode named at dispatch: `research-skill-gap` (missing-skill gap), `research-tooling` (capability gate), `research-transcript` (harvest a dropped transcript). Human-gated adopts.                                                                                     | High, rare/occasional                            |
| debrief            | opus  | high   | Retrospective / learning loop (opt-in, offered after a fix, friction, or a human override): root-cause → one verdict (update project skill / dispatch researcher / update docs / refine rubric / framework finding / no change). May call Hermes. Human-gated applies, project surfaces only. | High per run, rare                               |
| handoff-summarizer | haiku | low    | Distill a builder's handoff file to ≤5 lines                                                                                                                                                                                                                                                  | Trivial, frequent                                |

### CORE pipeline stages (being promoted stage by stage — `plugin/docs/process/promote-agent-to-core.md`)

| agent          | model  | effort | when used                                                                                                                                                                                                                                                                                                                                                                                    | cost expectation                        |
| -------------- | ------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| junior-analyst | sonnet | high   | The read-only WORKER lane. `triage` (`triage-method`) — root cause, severity, necessity → `## 🔍 Triage` + `triaged`/`sev:*`/`area:*`. `sweep` (`gate-sweep`) — gates verbatim + diff/commit hygiene → QUICK-PASS or a FIX list, **no labels**. The pipeline's fan-out point                                                                                                                 | Low-medium per run; several in parallel |
| senior-analyst | opus   | high   | The JUDGEMENT lane (read-only on tree + tracker). `solution` (`solution-method`) — verify the cause + spec the fix. `audit` (`adversarial-review`) — try to BREAK it. `pre-pr` (`pre-pr-review`) — after QA, delivery vs DESIGN. `push` (`push-method`) — verify then publish; never the author; flags, never fixes. Each dispatch is a FRESH context, which is what keeps generator ≠ judge | High per run, the main judgement spend  |
| developer      | opus   | high   | `implement` — build the ANALYSIS/PRD spec, add the named regression test, leave it UNCOMMITTED. The pipeline's only Edit/Write agent                                                                                                                                                                                                                                                         | High per issue; one at a time           |
| tester         | sonnet | high   | `qa` gate — re-run the project's own commands per touched package + judge the regression test. **Its label is the deploy switch**                                                                                                                                                                                                                                                            | Medium, per implemented issue           |

**A lane is a SKILL, never a new agent.** Both analysts carry several; adding a checklist adds a
skill. A second same-model reader whose instructions differ by a few lines is the bloat this file
forbids below.

## Webapp domain (`domains/webapp/plugin/agents/`)

| agent      | model  | effort | when used                                                                                                                                                                          | cost expectation   |
| ---------- | ------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| uat-runner | sonnet | high   | Acceptance against a running app, dispatched by SCENARIO not issue — out-of-band, gates nothing. PASS / FAIL / BLOCKED; the lane (browser or device) comes from the installed pack | Low, batch cadence |

`uat-runner` is CORE as of this pass — one agent holding the contract (never boot, never write,
never type credentials, refuse to exceed the project's caps) while the LANE comes from the installed
pack: expoapp ships the simulator/emulator lanes, webapp ships `webapp-uat`. Its verdict vocabulary
is three-valued — PASS / FAIL / BLOCKED — because a product defect and a setup problem need
different answers. **No lane installed is a BLOCKED verdict**, not a generic run.

Two rules hold the roster at this shape:

- **Triage and solution stay separate stages.** Fusing them costs the independent second read —
  the pass that catches a confidently wrong root cause before any code is written.
- **A lane is not an agent.** The mechanical sweep and the adversarial review are checklists on the
  two analysts. Same model, same read-only contract, same tools, differing only in what they read
  is a lane, and it belongs in a skill.

## Roster discipline (the bar for adding an agent)

**One agent per cluster.** A new agent is created ONLY when:

- **(a) an existing agent exceeds ~12 skills** — the cluster has outgrown one charter and
  splits along its natural seam; or
- **(b) the role must run in parallel all the time** — it needs its own slot because it
  runs alongside the others constantly (the pipeline stages: junior-analyst/senior-analyst/developer/tester/…).

Everything else is a **skill on an existing agent**: variations of one role are modes the
agent loads (see `researcher` + its `research-*` mode skills), never sibling agents. Never
multiple same-model agents whose instructions differ by a few lines — that is roster
bloat: it widens the orchestrator's mis-routing surface, costs a description line every
turn, and multiplies maintenance.

Enforcement pair: `agents-lint` WARNs on same-model multiplicity without a
`roster-justification:` (treat the warning as a design smell, not noise), and the
framework-audit's D1 dimension ("agents with too many skills") watches the ~12-skill split
threshold from the other side.

## Naming convention (framework vs project agents)

- **Framework agents** (CORE + domain packs) are **plain role nouns** (`junior-analyst`,
  `researcher`, `debrief`) — they run namespaced (`xenomoon:<name>` /
  `xenomoon-<domain>:<name>`) and the UI shows the bare role ("Analyst", "Debrief").
- **Project-local agents** (`<project>/.claude/agents/`) are prefixed **`p-<name>`**
  (`p-bug-triage`, `p-scrape-2fase`). The UI renders them "Project · <Name>", so the user
  always knows whose agent is talking. A project agent must NEVER reuse a framework
  agent's name — `doctor` warns on shadowing.
- **External workers are MCP tools, not agents.** Hermes (`mcp__ui__hermes`), Kimi
  (`mcp__ui__kimi`) and Codex (`mcp__ui__codex`) run somebody else's model on somebody else's
  billing, so none of them appears in the table above — a roster row would have to name a
  Claude model they do not use. The one that did (`codex-review`, a sonnet wrapper that read
  the companion's JSON and retyped it) was retired: the companion emits structure, so the
  distillation is deterministic string work in `ui/server/mcp-tools/codex-tool.js`.
  Where an external worker does surface in the UI it keeps its vendor prefix
  ("Hermes: Researcher", "Codex: Rescue", "Kimi: Coder").

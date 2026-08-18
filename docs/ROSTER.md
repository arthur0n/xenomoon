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

| agent          | model  | effort | when used                                                                                                                                                                             | cost expectation                              |
| -------------- | ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| junior-analyst | sonnet | high   | `/triage` — prove the root cause, score severity, judge necessity (`necessary`/`fold`/`not-necessary`): `## 🔍 Triage` + `triaged` / `sev:*` / `area:*`. The pipeline's fan-out stage | Low-medium per issue; several run in parallel |
| senior-analyst | opus   | high   | `/solution` — verify that cause against real code (CONFIRMED/REFINED/WRONG) + design the minimal fix: `## 🔬 ANALYSIS` spec + `solution-ready`. Serial                                | High per issue, the main design spend         |

## Webapp domain (`domains/webapp/plugin/agents/`)

| agent      | model  | effort | when used                                                                            | cost expectation                                        |
| ---------- | ------ | ------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| developer  | sonnet | high   | Implement the ANALYSIS/PRD spec, add the named regression test, leave uncommitted    | Medium-high per issue (effort-justified: owner mandate) |
| tester     | sonnet | medium | `/qa` gate: re-run gates + judge the regression test against Acceptance              | Medium, per implemented issue                           |
| reviewer   | opus   | high   | `/audit` adversarial review of the uncommitted diff (Codex replaces it when enabled) | High — skippable for sev:low/cosmetic                   |
| uat-runner | sonnet | low    | `/uat` capped Playwright acceptance (POC-first, out-of-band)                         | Low, batch cadence                                      |

`developer`, `tester`, `reviewer` and `uat-runner` are the stages still awaiting promotion into
CORE.

**Retired — do not reintroduce:** `committer` (2026-07-21 → direct hook-gated `/commit`), and the
webapp-pack agent that fused triage with fix-design behind a single `/analyze` command and label
(2026-08-18). Both stages now live in CORE as `junior-analyst` (`/triage` → `triaged`) and
`senior-analyst` (`/solution` → `solution-ready`), so a pack never re-owns them. This line exists so
the merge is not re-attempted as a simplification: fusing them costs the independent second read,
which is what catches a confidently wrong root cause before code is written.

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
- **External agents** keep their vendor prefix in the UI ("Hermes: Researcher",
  "Codex: Reviewer", "Kimi: Coder").

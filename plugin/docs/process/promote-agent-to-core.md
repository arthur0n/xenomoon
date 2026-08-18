# Promote an agent to CORE

The pipeline (**triage → solution → implement → verify → human**) is what the framework IS, so
the agents that run it belong to CORE — one canonical name, one definition, every domain. A
domain pack changes **how** a stage is carried out (browser vs simulator), which is **skills**,
never a second copy of the role.

This is the process for moving a proven agent — from a bound project's `.claude/agents/`, or from
a domain pack — into `plugin/agents/`. It is deliberate and human-gated: promote what has
actually been used, never a draft.

## The three-way split

A working agent file is usually three kinds of content fused together. Promotion separates them:

| goes to                                               | what belongs there                                                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **CORE agent** — `plugin/agents/<name>.md`, ~35 lines | role, constraints, `model` + `effort` + `tools`, idempotency/race gates, output + receipt contract, the `skills:` list |
| **CORE skill(s)** — `plugin/skills/<name>/SKILL.md`   | the METHOD: playbooks, rubrics, comment templates, label policy, judgement calls                                       |
| **stays PROJECT-LOCAL**                               | the repo and `gh` account, the codebase map, stack footguns, project script names, product facts                       |

The test for each paragraph: _would this sentence still be true on a different project?_ No →
project-local. Yes, but only for this stage → its stage skill. Yes, for every stage → a shared
skill.

## Steps

1. **Pick the source.** The copy that has actually run. If several exist, diff them — the newest
   one usually carries fixes the others lack, and those fixes are the reason to promote now.
2. **Check what CORE already owns.** Read `plugin/skills/` BEFORE writing anything. If a skill
   already covers part of the method, do not re-teach it — tag the agent onto that skill. If the
   project copy is **ahead** of the CORE skill, promote the delta INTO the existing skill (that is
   a one-line improvement, not a new capability).
3. **Extract shared method first.** Discipline used by several stages (how to investigate, how to
   verify, how to report) becomes its own skill. Copy-per-stage is how the drift started.
4. **Write the agent as a contract.** Role, gates, what it never does, what it returns. If you
   are writing a playbook into the agent, it belongs in a skill.
5. **Satisfy the gates** (`rtk npm run validate`):
   - `agents-lint.js` — every agent declares `effort`; `opus` must be `effort: high`; `sonnet` +
     `effort: high` is a **hard error** without an `effort-justification:` note; two agents sharing
     a model warn without a `roster-justification:` note.
   - `gen-skill-scope.js` — a skill's `agents:` audience and the agent's `skills:` frontmatter must
     agree. Audience tokens are the reserved groups (`orchestrator`, `builders`, `subagents`,
     `workers`) or an agent name.
6. **Make it reachable.** A capability nothing routes to is dead weight: ship the command
   (`plugin/commands/<stage>.md`, CORE — the trigger for a CORE agent is CORE) and add the routing
   line to the orchestrator of the pack you are testing in. Frontmatter grants a tool; only the
   prompt and the routing say when to reach for it.
7. **Test it on real work** in a bound clone before promoting the next agent. A promotion that has
   never run is a guess.
8. **Then retire the copies** — one tree at a time, sweeping every reference with `rg` (agents'
   `skills:` and body refs, commands, orchestrator routing, templates, hooks, `domain.json`). Do
   not retire a copy whose content has no home yet: if the old agent fused two stages, the second
   stage needs promoting first, or the pack loses it.

## Rules

- **One canonical name across every tree.** The same role under two names is the drift this
  process exists to end.
- **Never promote project FACTS.** They ship to every project and are wrong everywhere else. The
  method generalises; the facts do not.
- **A new lane is a skill, not an agent.** An agent earns its own file when it runs in **parallel**
  with others and needs a **distinct skill set**. Otherwise it is a lane of an existing agent,
  selected by the skill named at invocation.
- **Sequence: one agent at a time, one tree at a time.** Promote, wire, test, then the next. A
  half-promoted roster is worse than an un-promoted one, because two definitions both look
  authoritative.

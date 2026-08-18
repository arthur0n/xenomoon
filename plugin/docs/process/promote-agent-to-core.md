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
5. **Fix ONE first action, and put every rule in ONE place** — see the traps below; this is where
   the first promotion actually broke.
6. **Satisfy the gates** (`rtk npm run validate`):
   - `agents-lint.js` — every agent declares `effort`; `opus` must be `effort: high`; `sonnet` +
     `effort: high` is a **hard error** without an `effort-justification:` note; two agents sharing
     a model warn without a `roster-justification:` note.
   - `gen-skill-scope.js` — a skill's `agents:` audience and the agent's `skills:` frontmatter must
     agree. Audience tokens are the reserved groups (`orchestrator`, `builders`, `subagents`,
     `workers`) or an agent name. **`workers` is computed, not declared** — it is every agent
     holding `mcp__ui__tasks` (`skill-registry.js`), so granting that tool obliges `tasks-mcp` in
     the frontmatter.
   - **Never satisfy a gate by shrinking the agent.** The gate asks for wiring. Dropping a tool or
     a skill to turn it green, then justifying it afterwards, is how a capability quietly
     disappears — it happened on the first promotion and the reasoning sounded fine at the time.
7. **Adversarially review the diff BEFORE committing** (`/audit`, or the Codex companion:
   `node vendor/codex-plugin-cc/plugins/codex/scripts/codex-companion.mjs adversarial-review
--background --scope working-tree "<focus>"`). On the first promotion this caught a real defect
   that self-review and every `check:*` gate missed — the gates verify wiring, not whether the
   prose contradicts itself. Scope the focus explicitly and tell it to IGNORE untracked
   pack-install artifacts (`plugin/skills/{ios,android}-*`, pack-copied agents), or it reviews the
   installed tree and reports findings that are not yours.
8. **Make it reachable.** A capability nothing routes to is dead weight: ship the command
   (`plugin/commands/<stage>.md`, CORE — the trigger for a CORE agent is CORE) and add the routing
   line to the orchestrator of the pack you are testing in. Frontmatter grants a tool; only the
   prompt and the routing say when to reach for it. **Pass identity in the brief** (repo, issue,
   force flag): if the agent must open a project file to learn where the work lives, its cheap
   gates stop being cheap.
9. **Test it on real work** in a bound clone before promoting the next agent. A promotion that has
   never run is a guess. Note where it can run: the web UI loads `plugin/` directly
   (`session.js` → `resolveSessionPlugins`), so a server restart is the whole install; a plain
   terminal session needs `/plugin marketplace add <framework>` + `/plugin install`, and without
   that the new agent is simply not a dispatchable subagent type.
10. **Then retire the copies** — one tree at a time, sweeping every reference (agents' `skills:`
    and body refs, commands, orchestrator routing, READMEs, templates, hooks, `domain.json`,
    setup scripts).
    - **Sweep with `rg --hidden`.** Without it `rg` skips dotted dirs, so a sweep of a project
      silently misses **all of `.claude/`** — where the references actually are. The first
      retirement "found" 2 references this way; the real count was 9 across 4 files.
    - **Carry the facts out before deleting the file.** Identity strings (repo, `gh` account) often
      live ONLY inside the agent being deleted. Move them to the project's `CLAUDE.md`/`AGENTS.md`
      first, or the promoted agent's first `gh` call fails.
    - **Repoint consumers, don't just delete.** Downstream stages name the retired agent in their
      prompts ("take the <old-agent> findings"); those become dangling contracts.
    - Do not retire a copy whose content has no home yet: if the old agent fused two stages, the
      second stage needs promoting first, or the pack loses it.

## Traps — every one of these bit the FIRST promotion (triage → `junior-analyst`)

Recorded because splitting one file into agent + skills creates failure modes the original never
had. All four were real; three were invisible to `npm run validate`.

### 1. The competing first action

Splitting a fused agent gives each piece an opening instruction, and they contradict. The triage
promotion ended up with **three** claims on the first action: the agent said "records first"
(`library-first`), the orientation section said "read `CLAUDE.md` first", and the gate said "read
labels and nothing else". A compliant agent would search the library and read project files for an
issue it was about to skip — the exact cost the gate exists to prevent, worst on a sweep where the
skip path is most of the work.

**The rule:** exactly one instruction may claim to be first, and it is the **cheapest skip gate**.
Everything else is explicitly "after step 0". Write the ordering as a numbered lane in the agent
so a reader can see there is only one entry point.

### 2. Two homes for one rule

The gate lived in both the agent and its skill. Within a single session the copies drifted — one
said label-only, the other still required reading a comment on skip. This is D5 duplication with a
correctness edge: a future editor satisfies one copy and leaves the other authoritative-looking.

**The rule:** the skill owns the rule in full; the agent carries a one-line summary **and states
which wins** — "if this summary and the skill disagree, the skill wins, and the disagreement is a
bug to report." Never two full copies.

### 3. Letting a gate redesign the agent

`gen-skill-scope` demanded `tasks-mcp` in the frontmatter because the agent held `mcp__ui__tasks`.
The first attempt removed the **tool** to make the gate green, and wrote a plausible justification
for why triage doesn't need the board. That was the gate rewriting the capability.

**The rule:** a gate failure is a wiring instruction. Add the wiring. If you find yourself
explaining why the capability wasn't needed after all, stop — that reasoning arrived to serve the
gate, not the design.

### 4. Prose contradictions that no `check:*` can see

`validate` proves the wiring: frontmatter agrees with audiences, models satisfy policy, nothing
project-specific leaked. It cannot see that paragraph 3 contradicts paragraph 7. The first
promotion passed all 8 checks green while carrying trap 1. An adversarial review (Codex, or
`/audit`) found it in one pass — and found the follow-up contradiction each time a fix introduced
a new one. Budget more than one review round: fixing an ordering bug tends to create the next.

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

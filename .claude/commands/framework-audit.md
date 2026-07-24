---
description: Framework self-audit — score agents/skills/orchestrator/commands across 10 quality dimensions, record findings in the ledger, propose fixes, critique itself. Manual, human-run. Forge-local (not shipped).
argument-hint: "[D1..D10 | all]"
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, Agent, Skill, mcp__ui__form, mcp__ui__tasks, mcp__ui__ask
model: opus
---

# Framework self-audit — keep the spine clean as it grows

A deliberate habit, not a one-shot. Xenomoon is a **self-improvement framework**: each run
inspects the framework's own spine — agents, skills, orchestrator, and **its own commands** —
finds quality drift, proposes concrete fixes, records what it found so the next run skips it,
and critiques itself. It loads caveman itself (step 0) and runs best high-effort (type
`ultrathink`, or invoke on a high-effort turn). You won't catch everything in one pass — that's expected.

This command is **forge-local and human-run**. It **reports + proposes only** — it does not
auto-fix, auto-file, schedule itself, or write under `plugin/`. Each finding gets a stable id;
the human picks which to fix, then the companion **`/framework-audit-fix <ids>`** applies only
the agreed subset. The human decides every change.

## Why this exists

The framework ships to every project. A skill dirty with one project's names, an agent grown past
its remit, a misleading skill name, or a bloated prompt all degrade every project silently.
Catching these on a cadence keeps the framework general, lean, and data-driven — the
properties the promotion rubric (`plugin/docs/process/promotion.md`) demands.

## Where the data lives (paths are repo-relative; cwd = forge root)

- **Agents:** `plugin/agents/*.md` — frontmatter `skills:` list + the prompt body.
- **Skills:** `plugin/skills/*/SKILL.md` — frontmatter `name`/`description`/`agents` + body.
- **Orchestrator:** `domains/*/orchestrator.md` (each pack's source; `forge new` copies the picked
  one to `plugin/orchestrator.md` at install — so CORE has none until a domain is installed).
- **Commands:** `plugin/commands/*.md` and ALL forge-local self-improvement commands —
  glob `.claude/commands/*.md`, never a hardcoded list (it goes stale; token-audit.md was
  silently missed by one).
- **Library (AGNOSTIC records only — ships to every project):** `plugin/library/**/*.md`. A domain
  pack installs its records here (findings/verdicts/etc.); CORE ships only `README.md` + `token-audits/`.
  A project's specific FACTS live PROJECT-LOCAL (the bound project repo), never here.
- **Ledger:** `.claude/framework-audits/LEDGER.json` — the SOURCE OF TRUTH (a `findings[]` array);
  read FIRST, append findings AFTER (push objects to `findings[]`, dedup by `id`). `LEDGER.md` is a
  committed readable view — keep it in sync by hand (there is no `npm run ledger` regen script). Full
  schema: `.claude/framework-audits/README.md`.

**Search with the Grep TOOL or `/opt/homebrew/bin/rg` (full path) — NOT bash `grep`.** A hook routes
bash `grep`/`rg` through `rtk`, which silently DROPS and MANGLES matches (it rewrote the literal word
`quick`→`n`, and missed `DiceOfFate` in files that contained it). Bash grep is unreliable for this
audit — use the Grep tool, full-path `rg`, the Read tool, or a sub-agent that has the Grep tool. Use
`wc` / `rg --files` for sizes/listings. Don't slurp every file into context.

**Grep vs graphify — pick by question shape.** This repo ships a knowledge graph (`graphify-out/`).
For CONCEPTUAL gather — "how does routing connect", "how does the verify flow span agents" (D6/D8) —
a `graphify query "<question>"` returns a scoped subgraph cheaply; reach for it first. But for a
LITERAL contamination/rename sweep (D2/D3) use full-path `rg`: graphify stores STRUCTURE (god nodes,
communities, edges), NOT prose — the string you're sweeping isn't in the graph (`shared_apartment`
returns nothing from `graph.json`), so graphify CANNOT enumerate every occurrence, and a sweep that
misses one ref leaves contamination behind. Completeness → `rg`; concepts → graphify.

## Preflight — resolve every ref before auditing (abort if the spine moved)

Before running ANY dimension, RESOLVE every path and npm-script this command names against the live
repo: `ls`/`rg` the paths in "Where the data lives", and read `package.json` scripts for each
`npm run …` it cites (`node -e` or the Read tool — not by memory). This command can only audit the
spine it can still describe. If a referenced path or script is GONE (a file moved, a `check:*` or
regen script was renamed or never existed), do NOT audit against the stale map — you'd emit phantom
findings against a spine the command mis-describes. ABORT and file ONE finding (dim **D7** — this
suite is itself a forge-local command) listing the stale refs, so the suite gets re-aimed first. Fix
the map, then audit.

## Steps

0. **Load caveman first.** Before anything else, invoke the `caveman` skill — this command
   reports in caveman mode (terse; all technical substance kept, only fluff dropped).

1. **Read the ledger.** Parse `LEDGER.json` (a real JSON parse of `findings[]`, not a table scan) —
   pruned after each pass, so it holds the last-audit date (`lastAudit`) plus any findings still
   `open`/`later`. Don't re-surface a finding already in `findings[]` open/later (or one `lastAudit`
   says was resolved); otherwise audit fresh against the current files.

2. **Pick scope.** Default `all`. `$ARGUMENTS` overrides: a **dimension id** (`D3`) audits just
   that one; a **finding id** (`D7-scope-stale-four`) re-verifies that single open ledger finding
   against current files — refine/confirm it for the human to apply, not a fresh scan. Skip any
   dimension audited recently unless its area changed since (check git).

3. **Audit each dimension — in ONE context.** The plugin/ spine (its agents + skills + the
   installed orchestrator) fits Opus's context window whole, so gather and judge the dimensions
   directly here — no sub-agent-per-dimension fan-out (context-anxiety scaffolding from a
   smaller-window era; the spine no longer overflows one context). Signals:

   - **D1 — Agents with too many skills.** Don't recount by hand — run `rtk npm run validate` (it
     runs `check:skills` = `gen-skill-scope.js`) and read the skill-scope warnings: its
     index-expansion count is authoritative (it caught over-cap agents a frontmatter-only count
     missed). The soft cap is **~10** skills per agent (`INDEX_SOFT_CAP` in `gen-skill-scope.js`); in
     the CORE spine the `builders` audience is EMPTY (`BUILDERS = []` in `skill-registry.js` — a
     domain pack scopes its OWN builder cohort inside `domains/<name>/`, and may carry a heavier
     general builder its own scoping caps). For a flagged agent, judge whether its skills cluster into
     a sub-domain deserving its own specialized agent; name the split.

   - **D2 — Project/path contamination in skills.** A skill must be domain-agnostic (this is what
     `check:agnostic` / `check:contamination` gate deterministically). Grep `plugin/skills/*/SKILL.md`
     **and any shipped library prose `plugin/library/**/_.md`** (it ships to every project too) for:
project proper nouns, character/mechanic/entity/screen names, binary names, hardcoded paths
(`../<project>`, absolutes, specific project source files), "project-local" self-declarations.
Quote `file:line`. **skill = METHOD, project = FACTS:** strip the skill to the agnostic method.
The project's specific facts already live PROJECT-LOCAL (the bound project repo's `.claude/`/`design/`/ its own`library/`) — do NOT copy the worked example into `plugin/library/` (it ships
to every project = re-contamination; that folder is for AGNOSTIC records only). Apply this to
AGENT prompts too (`description:`/`name:`/ body / cache namespaces), not just skills — and to
domain-PARADIGM lock-in (see D3). **Roadmap citations are the same bug:**`docs/roadmap/_.md`is forge-local project history (a specific project's plan, retired once that project ships) —
grep for`docs/roadmap/`, `Phase-N`/`Phase N`/`phase A3`-style ids, and phase-gate language
("the Phase-5 gate") in any shipped file. Citing it as scope/reference authority is D2
contamination; give the agnostic technical rationale instead and drop the citation entirely.
`docs/roadmap/\*.md` itself is NEVER an audit target — it's allowed to be as project-specific as it
     likes; only flag a SHIPPED file (skill/agent/library) that points at it.

   - **D3 — Name vs scope.** Does each skill's `name` match what it actually covers? Flag
     names too broad for narrow content or too narrow for broad content (the classic: a
     `combat` skill/agent that's really only ranged/melee/dot — resolved here by splitting). Propose a
     truer name; apply the same lens to agent names. **Scope includes PARADIGM/DOMAIN fit:** flag a
     skill silently locked to one paradigm the framework spans more than one of (a platform, a
     rendering/UI mode, a domain the pack doesn't universally share). The fix is usually to SCOPE it
     in the description (declare the paradigm it's actually for), mirroring an existing sibling split —
     not to force one skill to cover both.

   - **D4 — Data-driven orientation.** Does each skill teach **data-driven** systems
     (Resources / `.tres` / `@export` tunables / dictionaries / config) or a hardcoded
     one-off? BUT judge PROPORTION (the framework's own rule): **`@export` tunables ARE data-driven**
     (designer-tunable, no code change), and a SINGLE-instance rig (one player / camera / lighting)
     with `@export`s does NOT need a Resource — forcing one is the over-engineering the framework
     warns against. Values in a scene / material / shader-uniform also count as data. Flag ONLY
     MULTI-instance systems (enemies, abilities, items) that hardcode per-instance instead of
     authoring data. Expect most D4 flags to be false positives — say so.

   - **D5 — Agent prompt bloat / duplication.** `wc -l -w plugin/agents/*.md`; flag the largest +
     prose blocks repeated verbatim across agents. Extract to a shared skill ONLY when BOTH hold:
     (a) duplicated across MULTIPLE agents (a skill exists to SHARE — a single-consumer block stays
     inline), AND (b) it can load RELIABLY (list in frontmatter + a load line at conversation start,
     like the caveman trigger). Always-needed rules that can't tolerate a missed load (the `rtk`
     rule, verify gates, the caveman terse rule itself) stay INLINE — reliability over DRY (the
     caveman-trigger lesson). The clean win to look for: a verbatim block across ≥3 agents that's
     only needed at a known step (e.g. the researchers' 6-bucket → `research-presenting`).

   - **D6 — Orchestrator.** Read the domain orchestrators `domains/*/orchestrator.md` (each pack's
     source; `plugin/orchestrator.md` once a domain is installed). Flag: directives duplicated across
     agents that should be centralized; dense step-by-step prose that belongs in a reusable
     skill; philosophy/tone that dilutes routing. Propose the move/trim.

   - **D7 — The framework's own commands.** Audit `plugin/commands/*.md` AND all forge-local
     self-improvement commands (glob `.claude/commands/*.md` — never assume a fixed list) for
     stale references
     (paths/files that moved), scope creep, dead steps, and whether each command still
     self-critiques. Apply D2/D3/D5 lenses to commands too. **Enumeration drift:** flag any command
     that hardcodes a list of sibling files where a glob (`.claude/commands/*.md`) would stay
     current — such lists silently go stale as files are added.

   - **D8 — Verification flow completeness.** Does the verify/grade story hold end-to-end? Two layers.
     (a) The FRAMEWORK gate: `rtk npm run validate` = `tsc` + `eslint` + `check:structure`
     (`ui/structure.check.js`) + `check:skills` (`gen-skill-scope.js`) + `check:agents`
     (`agents-lint.js`) + `check:agnostic` (`scripts/check-spine-agnostic.sh`) + `check:contamination`
     (`gen-contamination.js`). (b) The active DOMAIN pack's own verify chain — its builder gate +
     evaluator agents (e.g. `webapp`'s QA → review agents; `forge new` installs these into `plugin/`).
     Flag a break: a `check:*` a doc/skill claims that the gate doesn't actually run; an orphan check
     nothing composes; a domain builder that lists a verify skill with no `## Verification` block; a
     skill re-teaching another's job instead of pointing at it. (CORE ships no builder/evaluator
     agents — those arrive with a domain pack.)

   - **D9 — Harness still load-bearing under the current model.** Scaffolding encodes assumptions
     about model limits that go STALE as models improve (the harness-design lesson: context-reset
     scaffolding was DROPPED Sonnet 4.5 → Opus 4.6). Cut both ways:
     - **Strip** — is a scaffold (a model-tier choice, a context-anxiety mitigation, sprint-style
       decomposition, a multi-step gate) still earning its context cost under the CURRENT model, or
       now overhead? Name what to remove/down-tier and the sample task that would prove it.
     - **Harden** — is there a FUZZY agent-judgment step a deterministic tool should replace (the
       determinism ratchet)? Name the `check_*` / tool to draft.
       Model-upgrade ritual: on a major model release, strip one scaffold on a sample task, measure,
       decide keep/strip/retier — record as D9 findings. Expect most D9 flags to need a real
       before/after measurement, not a hunch — say which are measured vs hypothesised.

   - **D10 — Abstraction-level / domain-layering.** Does each capability sit at ONE altitude — a
     GENERIC baseline (engine/quality/way-of-work: renderer defaults, folder layout, naming,
     warnings-as-errors, structural workflows) OR a DOMAIN/AESTHETIC payload — and never fuse the two
     into one un-swappable block? D2 catches one PROJECT's facts; D10 catches one DOMAIN's/art-style's
     payload smuggled into a capability whose name or role promises generality. The tell: a
     generic-tier capability (name/role says 'conventions', 'baseline', 'keystone', 'use FIRST') that
     hardcodes a domain constant as 'non-negotiable' — a stack-specific call (a React state library,
     an Expo build flag) stamped 'always do this' inside a skill sold as the shared structural
     workflow. **The probe is the SECOND-DOMAIN TEST:** read the capability from a domain this
     framework also spans that does NOT share the payload (the expo pack where a webapp one taught,
     or vice versa) — does the generic half
     still apply cleanly and the payload half fall away as a swappable layer? Also flag
     DEPENDENCY-DIRECTION INVERSIONS: a generic workflow living INSIDE a domain-named capability so a
     second domain must depend on the first (the HD import skill inheriting the structural
     mesh-import flow FROM the pixel-art skill) — the generic core should be the base BOTH aesthetics
     import. Fix pattern: split the generic baseline into its own neutral capability; the payload
     becomes a thin layer on top. Expect false positives: a payload-tier capability SHOULD carry
     domain constants — only flag them where the declared tier is GENERIC. Origin:
     godot-project-conventions fused a quality baseline with 3D-pixel-art payload (fixed 322e4da);
     invisible to every single-domain loop (contamination gates catch one project's facts, session
     mining only sees the domain in use) — surfaced only by a fork's second-domain strip.

4. **Judge + id each finding.** EXPECT most findings to be false positives on inspection — they are
   hypotheses until checked against the actual files: generic industry vocabulary (tank/grunt/runner)
   ≠ contamination; `@export` ≠ hardcoded; a single-consumer or single-instance pattern ≠ something to
   extract or Resource-ify. Keep only opportunities that survive that scrutiny — a false "fix this" is
   worse than silence — and reclassify the rest to `skip`/`later` WITH the reason. (Real fixes this
   loop has found: cross-agent verbatim dup, project-name contamination, an over-broad agent, an opaque
   name, a paradigm-locked skill. Non-fixes correctly skipped: generic vocab, data-driven rigs,
   single-consumer orchestrator rules.) Give each surviving finding a **stable id** `<Dn>-<slug>`
   (e.g. `D1-combat`, `D2-greybox`, `D5-research-presenting`) — the fix command targets findings by
   this id, so reuse the same id across runs for the same issue.
   **Then classify each survivor's SCOPE** (`plugin/docs/process/updates-routing.md`): a
   FRAMEWORK/spine defect → the ledger (below, the normal path). A missing DOMAIN capability
   (the fix is really a skill/record the domain pack should carry) → do NOT ledger it — emit the
   draft content in the run report for the human to materialize via foreground `/learn`
   (promotions board → `domains/<name>/plugin/`). A PROJECT-only fact → the project's CLAUDE.md,
   noted in the report.

5. **Record — brief, and KEEP THE LEDGER LEAN.** For each surviving finding, push ONE object to
   `LEDGER.json`'s `findings[]` (dedup by `id`): `{ id, dim, bucket, verdict, status, finding }`
   plus an optional `pattern` (one line — the good pattern to follow, a positive exemplar, not just
   the problem). `finding` is one line (problem + proposed fix), `dim` is the id's `D`-prefix. Update `lastAudit`,
   then keep the readable `LEDGER.md` view in sync by hand (there is no `npm run ledger` regen script). The
   ledger is EPHEMERAL working state, not a history log: carry only findings still `open`/`later`.
   **Once a pass fully resolves (nothing left `open`), PRUNE `findings[]` empty and set `lastAudit`
   to a one-line summary of what the pass did** — the fixes live in the files + git, not here. Don't
   let it accumulate done/skip history.

6. **Present — the 6 buckets (skill-researcher convention).** Report like the **skill-researcher**
   agent does (`plugin/agents/skill-researcher.md`): never gate a finding with a bare
   fix/skip. Decompose the audit into the six buckets, put the verdict ON TOP, and let the
   human decide per finding:
   1. **The ideal** (from the idea) — what this dimension should look like (domain-agnostic skills,
      lean agents, honest names, data-driven systems…).
   2. **Current state** (from the candidate) — what the audit actually found, with evidence
      (`file:line`, counts).
   3. **No-brainers** — mechanical, safe fixes to apply as-is. List each by `id`.
   4. **Improvements** — worth fixing but needs rework/judgment, and HOW. List each by `id`.
   5. **System / Later** — framework-level ideas to park (reuse the framework's existing
      "Later" parking; record in the ledger, don't fix now).
   6. **Skip** — looked like issues but aren't worth the churn; say why.
      Verdict sits on top: each finding is `fix-now` (bucket 3/4) / `later` (5) / `skip` (6).
      If `mcp__ui__form` is available, lead with a read-only `note` carrying the buckets +
      evidence, then a **multiSelect** of the bucket 3/4 ids so the human ticks which to fix —
      your recommendation first. Otherwise report the buckets terse and tell the human to run
      `/framework-audit-fix <ids>` with the ids they agree to. **Never auto-apply here.**

7. **Self-critique (in a subagent).** This is self-improvement — improve the loop, not just the
   findings. Dispatch this critique to a throwaway subagent so its reasoning never becomes
   main-window context debt: hand it the run's notes and have it propose one
   fix to THIS command or the ledger format (a better signal to grep, a missing dimension, a step
   that didn't pay off), and if a fix is obvious and safe apply it there. It RETURNS ONLY the
   one-line verdict — record that as the entry's `Process note` (or `none`). Keep the verdict, not
   the critique transcript.

## Do this

- **Audit fresh ground** — check the ledger first and spend the pass on dimensions not covered
  recently (re-audit one only when its area changed).
- **Filter before reading** — pull just the slice you need with the Grep tool / full-path `rg` /
  `wc` / sub-agents (the `rtk` hook drops match content from bash `grep`/`rtk grep`, so those never
  see the real matches — see the search warning above).
- **Report; let the human apply.** This command surfaces buckets; `/framework-audit-fix` applies
  the agreed ids and the human decides. Writing under `plugin/` or auto-applying is never this
  command's job (step 7's tweaks to this command / ledger are the one exception).
- **Keep the framework agnostic** — a project's specific FACTS live PROJECT-LOCAL (the bound project
  repo). `plugin/library/` ships to every project, so it too holds AGNOSTIC records only — never a
  project fact.
- **Treat `docs/roadmap/*.md` as out of scope** — it's forge-local project history. Only flag a
  SHIPPED file that cites it as reference/authority (D2); the roadmap doc itself stays untouched.
- **Write one-line ledger entries** — brevity is the point; the next run reads them first.

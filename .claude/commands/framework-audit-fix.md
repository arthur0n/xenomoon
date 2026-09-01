---
description: Apply agreed framework-audit fixes by finding-id. Reads the audit ledger, applies ONLY the ids you pass, verifies, removes their ledger rows (git + the commit message hold the fix record). Manual, human-run. Forge-local (not shipped).
argument-hint: "<id[,id...]> | all-agreed"
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, Agent, Skill, mcp__ui__ask
model: opus
---

# Apply framework-audit fixes — only the ids the human agreed

FIRST load CAVEMAN and acknowledge to the user.
The companion to `/framework-audit`. The audit **reports**; this command **acts**, on exactly
the findings you name. It never invents new findings, never fixes an id you didn't pass, and
never deletes/overwrites beyond the recorded fix. Run it caveman.

## Inputs

- `$ARGUMENTS` = finding ids to apply: `D2-greybox,D1-combat` (comma or space separated).
- `all-agreed` = every ledger finding whose verdict is `fix-now` and status `open`. Still
  itemize what it will touch before applying.

## Where the data lives (repo-relative; cwd = forge root)

- **Ledger:** `.claude/framework-audits/LEDGER.json` — the SOURCE OF TRUTH (a `findings[]` array) for
  ids, fixes, status. `LEDGER.md` is a GENERATED VIEW — after any write run `npm run ledger`
  (never hand-edit it; the pre-commit hook regenerates too). Schema: `.claude/framework-audits/README.md`.
- **Targets:** `plugin/skills/*/SKILL.md`, `plugin/agents/*.md`, `domains/*/orchestrator.md` (the
  pack source; `plugin/orchestrator.md` once installed), `plugin/commands/*.md`, the forge-local
  `.claude/commands/*.md` (the self-improvement commands — when a D7 finding targets an audit command
  itself), `plugin/library/**/*.md` (records a domain pack installs; CORE ships only `README.md` +
  `token-audits/`).
- Editing a plugin file directly **is** the sanctioned path for a general improvement
  (`plugin/docs/process/promotion.md`: "General improvement → edit the file directly in the
  plugin"). A skill stays domain-agnostic; the project's own FACTS live PROJECT-LOCAL (the bound
  project repo), NOT in `plugin/library/` (it ships to every project). `plugin/library/` is for
  AGNOSTIC records.
- **Search with the Grep TOOL or `/opt/homebrew/bin/rg` (full path), NEVER bash `grep`** — the `rtk`
  hook silently drops/mangles matches, so a rename/re-tag sweep done with bash grep WILL miss refs.
  Don't reach for `graphify query` for a fix sweep either: it stores STRUCTURE, not prose, so the
  literal string you're replacing isn't in the graph — it can't enumerate every occurrence. graphify
  is for conceptual questions; a fix's literal sweep needs `rg`'s completeness.

## Steps

1. **Resolve ids.** Parse `LEDGER.json` (a real JSON parse of `findings[]`). For each requested id
   find its object. If an id is missing (already resolved — applied findings are REMOVED, not kept),
   **skip it and say so** — do not apply. If its verdict is `later`/`skip` (not `fix-now`): under
   `all-agreed` this still means skip (that mode only ever means `fix-now`+`open`); but when the
   human explicitly named the id in `$ARGUMENTS`, that IS the override — proceed, and note the
   override in the report. Never apply an id the human didn't name.
2. **Itemize before acting — and CHECK THE FINDING'S PREMISES against the repo.** List each id → the
   exact files it will change and the operation. A ledger row is an OLD claim about the repo, not a
   verified fact: before you edit, read the code it names and confirm each premise still holds (the
   surface exists, the data source it counts actually accumulates, the named consumer really carries
   that data). If a premise is FALSE, stop and re-decide with the human (`mcp__ui__ask`) — apply the
   corrected fix, and say in the report that you deviated from the recorded one and why. For
   destructive or wide-blast ops (a rename touching many refs, a file move/delete, an agent split),
   confirm with `mcp__ui__ask` first if available; otherwise state it plainly and proceed (the human
   already agreed by passing the id).
3. **Apply per dimension playbook:**
   - **D1 (over-cap agent → split):** create the new specialized agent(s) `plugin/agents/<new>.md`
     (copy a sibling's frontmatter shape + the caveman trigger line), move the sub-domain skills by
     editing each skill's `agents:` tag, and set each new/renamed agent's frontmatter `skills:` to its
     core + domain set. ALSO (don't forget — this is where the blast radius bites): add the new
     name(s) to the `BUILDERS` alias in `ui/server/features/skills/skill-registry.js`; and rewrite the
     genre/routing PROSE that named the old agent — sibling `description`s (godot-dev routing hints,
     player/visuals cross-refs), lineage notes ("split off from …"), and `set-skill-tool` / hook
     examples. `rtk npm run validate` (gen-skill-scope) catches the wiring; sweep the prose with the
     Grep tool.
   - **D2 (decontaminate skill):** rewrite the skill passage generically — strip it to the METHOD
     (no project/entity/binary names, no hardcoded paths). The project's specific FACTS already
     live project-local (check the bound project repo's `.claude/`/`design/` FIRST); do NOT copy the
     worked example into `plugin/library/` (it ships to every project = re-contamination). Apply to
     agent prompts + cache namespaces too, not just skills.
   - **D3 (rename for honest scope):** rename the skill dir + `name:` frontmatter + title, then sweep
     EVERY reference with the **Grep tool** (not bash grep) — agents' frontmatter `skills:` AND body
     refs, the skill's `agents:` tag, cross-skill Requirements, `plugin/library/` records, project-repo
     files, and any archived raw file carrying the old name. Wide blast radius — verify zero of the
     old name remains. (For a PARADIGM-scope fix, don't rename: just tighten the skill's
     `description`/intro to declare the paradigm it's actually for.)
   - **D4 (add data-driven variant):** add the Resource / `.tres` / `@export`-driven section the
     finding named; keep the existing canonical path, add the data-driven one beside it.
   - **D5 (extract shared block → skill):** for CROSS-agent duplication — create the new shared skill
     (`agents:` = the consuming agents), add it to each agent's frontmatter `skills:` AND a load line at
     conversation start (right after the caveman trigger, so it loads RELIABLY — not just listed), then
     delete the duplicated prose from each agent body. But if the duplication is WITHIN one agent file
     (a constraint restated 3x+ in the same prompt), DON'T make a skill — trim to a single canonical
     statement, KEEPING the fleet-standard intro + `## What you never do` scaffold (cut only the THIRD+
     echo, or the fleet's ~20 agents go inconsistent), and point the other mentions at the canonical
     one. "State each constraint once" means collapse the redundant echoes, not delete the scaffold.
     A THIRD shape: a duplicated COMMAND FILE across the shipped/forge-local boundary (e.g. a
     `plugin/commands/*.md` shadowing a `.claude/commands/*.md`) — delete the shipped copy (the
     practice is forge-local only) and sweep refs with `rg`; also check each copy's data source
     (e.g. a ledger path) BEFORE deleting — if the copies point at DIFFERENT files, deleting one
     copy can orphan the other's CORE-tracked resource, so redirect or fold it in first.
   - **D6 (orchestrator):** apply the recorded edit to the domain orchestrator
     `domains/*/orchestrator.md` (`plugin/orchestrator.md` once installed) — centralize a duplicated
     directive, move dense prose into a skill, or trim.
   - **D7 (command):** edit the target command per the finding — a shipped `plugin/commands/*.md`
     or a forge-local `.claude/commands/*.md` (the self-improvement commands audited under D7).
   - **D8 (verification-flow gap):** apply the recorded edit at the named layer — add the missing
     `## Verification` block to a domain builder, wire the claimed check into the framework gate (the
     relevant `check:*` script — `ui/structure.check.js`, `gen-skill-scope.js`, `agents-lint.js`,
     `scripts/check-spine-agnostic.sh`, `gen-contamination.js` — or the active domain pack's own
     gate) or correct the skill's claim, or replace a re-taught passage with a pointer to the owning
     skill, or REMOVE a redundant/superseded check whose job a live gate already does (an orphan check
     no gate composes and no skill documents) — delete it and confirm `rg` shows zero remaining refs.
     A new gate check graduates as a `check:*` script wired into `npm run validate`. Before concluding
     a claimed enforcement doesn't exist, ALSO check the SDK permission layer (`ui-control.js`
     `orchestratorGate`/`canUseTool`, wired via `session-permissions.js` `preToolGate`) — a deny can
     live there instead of in `plugin/hooks/` or a `check:*` script; a hooks-only sweep will false-flag it.
   - **D9 (harness simplification):** **strip** — apply the agreed removal/down-tier (edit the
     agent's `model:` / skill list, trim the scaffold, drop the dead gate step), then confirm the
     sample task + full verify still pass (a strip must not regress the gate). Deleting a WHOLE agent
     bites two spots no gate guards: hand-fix FEATURES.md `## Agents (N)` count (validate skips
     badges — a stale count ships silent) and correct any SIBLING ledger row that counts/names it
     (e.g. `13 sonnet + 2 haiku`). Or **harden** — draft the named check as a `check:*` script in
     `ui/server/cli/` wired into `npm run validate` (the fork's gate machinery). The canonical
     harden is NOT a bespoke checker that re-implements an existing analyzer — prefer escalating a
     linter/tsc rule (eslint config, tsconfig strictness) so the gap rides the existing
     `check`/`lint` machinery; reserve a bespoke script for gaps no existing analyzer can express.
   - **D10 (split the fused altitude):** carve the GENERIC baseline out of the domain-named
     capability into its own neutral capability (skill/agent), then rewrite BOTH the original payload
     and any sibling to LAYER their domain deltas on top of the neutral base — never let one aesthetic
     depend on another's skill. Fix the dependency direction: the generic core is the base both import;
     the payload shrinks to a thin filter/material/tuning delta. Confirm the second-domain read still
     holds (the generic half applies with the payload stripped) and full verify stays green. BLAST
     RADIUS the split bites beyond the skill prose: (a) a runtime skill-scope carve-out may exist
     PRECISELY for the inversion you're fixing (`STYLE_PIXEL_KEEP_ALWAYS` in
     `ui/server/features/skills/skill-scope.js` + its `skill-scope.check.js` tests) — re-derive which
     entries the always-kept neutral base now covers and prune/rewrite the comment; (b) new base skills
     are new frontmatter entries — check `BUILDER_INDEX_CAP` before adding both to an at-cap builder,
     else tag the base to a lighter agent and let the builder load it on-demand via the deltas'
     `## Requirements` (the `godot-3d-pixelation` precedent). Unlike D3 this is NOT a rename: sweep only
     refs to NEUTRAL content that MOVED to the base; leave valid domain-named refs intact.
   - **D12 (supply chain — bump a pinned dependency):** re-run `rtk npm run check:deps` FIRST; the
     ledger row records an age judged on the day it was written, and a version that was held then may
     be eligible now (or a newer one may have superseded it, restarting its own quarantine). Apply
     ONLY what the check reports as `ready`, one package at a time —
     `rtk npm update <name> --package-lock-only` — **never `npm audit fix`**, which applies the
     quarantined candidates too. Then re-run the check and read what actually landed: a bump can pull
     in a package fresher than the quarantine even when the bump itself is aged, and npm does not say
     which bump brought which. If a held version appears in the tree afterwards, `git checkout
package-lock.json` and leave the row for the next pass. Verify with `rtk npm ci` +
     `XENOMOON_DOMAIN=webapp rtk npm test` (a transitive bump is a runtime change, not a doc edit),
     and commit the lockfile ALONE — a dependency move belongs in its own revertable commit.
4. **Verify.** If any framework file changed: `rtk npm run validate` (tsc + eslint, zero
   warnings — this also runs the skill-scope check, catching D1/D3/D5 wiring mistakes) and
   `rtk npx prettier --write` on the touched files. If the fix touches a bash hook
   (`plugin/hooks/*.sh`) with no test harness, write ONE throwaway scratchpad script that
   exercises every branch in a single run before executing it — a PreToolUse security hook can
   block re-running a script file from the scratchpad, so don't plan on iterative re-runs.
   Report the result honestly; if validate
   fails, first confirm the failure is YOURS before acting — attribute red to your id only after
   checking it against the pre-edit state (`git stash`, re-run, or scope the failing files to what
   the finding touched). A pre-existing red from unrelated uncommitted WIP (a doc-only fix can't
   trip tsc/eslint) is NOT yours to fix or revert — say so and leave it. If the red IS yours, fix
   or revert that id and say so — never leave a gate red that your change caused.
5. **Record — REMOVE, don't stamp.** DELETE each applied id's object from `LEDGER.json`'s `findings[]`
   (match by `id`) — do NOT mark it `done <YYYY-MM-DD>` (git + this run's commit message are the "what
   was fixed" record, so the ledger stays lean — no `done` findings accumulate as distraction). If it
   clears the LAST `open`/`fix-now` finding anywhere in the ledger (the whole backlog is resolved),
   set `lastAudit` to a fresh one-line summary. Leave `later`/`skip` and un-applied findings untouched.
   Then run `npm run ledger` to regenerate the `LEDGER.md` + `ledger.html` views.
6. **Self-critique (in a subagent).** This is self-improvement — improve the loop, not just the fix.
   Dispatch this critique to a throwaway subagent so its reasoning never becomes main-window context
   debt: hand it the run's notes and have it flag anything that tripped the apply (a dimension
   playbook that misfit the finding, a blast-radius ref the playbook forgot, an ambiguous ledger
   field, a step that didn't pay off), and if a fix to THIS command or a dimension playbook is
   obvious and safe apply it there. It RETURNS ONLY the one-line verdict. Since this command REMOVES
   rows (no entry to hold a `Process note`), carry that one line into the run's report + commit
   message instead. Keep the verdict, not the critique transcript.
7. **Report — terse.** Per id: applied / skipped (+why), files changed, validate result, plus any
   self-critique note from step 6. This per-id summary IS the fix record now that rows are removed —
   carry it into the commit message (git, not the ledger, is the changelog; no separate changelog
   needed). End with anything still `open` the human may want next.

## Do this

- **Apply only the ids the human passed** — resolve each against `findings[]`; if an id is
  `later`/`skip` or already removed (resolved), skip it and say so. Never invent findings.
- **Verify the finding's premises in the repo before you edit** — read the code the row names; a
  premise that no longer holds means stop, re-decide with the human, and report the deviation.
- **Keep the gate green — that YOUR change didn't break** — `rtk npm run validate` must pass for
  what your edits touched; fix or revert the offending id rather than leaving it red. But first
  confirm the red is yours (check vs pre-edit state / scope to the finding's files) — never
  misattribute a pre-existing red from unrelated uncommitted WIP to a fix that can't have caused it.
- **Keep skills project-agnostic** — strip any project-specific content to the METHOD; the project
  holds its FACTS project-local (`plugin/library/` = AGNOSTIC records only).
- **Search with the Grep tool / full-path `rg`** — the `rtk` hook drops matches from bash `grep`,
  so a rename/re-tag sweep needs `rg`'s completeness.
- **Prefix every shell command with `rtk`.**

# Promotion — project-local → framework plugin

A new capability (a **skill**, **agent**, **tool**, or **library record**) starts
**project-local** in the bound project — `<project>/.claude/{skills,agents,library}/…` or
`<project>/tools/…` — and is usable immediately. It is **promoted** into this plugin, the ONE
capability tree that ships to every install, only when it clears the gate below.
**Default: stay local.** Promote deliberately, so the framework stays lean and doesn't bloat.

## Rubric — promote only if all four hold

1. **General** — useful to _any_ project the framework binds; no coupling to one project's
   domain, content, or names. This is the placeholder standard: ship the METHOD, never the
   project's own facts (exact business names/numbers, one project's data model or rules).
2. **Proven** — succeeded in **≥1 real use** in a project, not speculative.
3. **Non-overlapping** — doesn't duplicate an existing framework capability.
4. **Owned** — the framework owner accepts maintaining it going forward.

If any criterion fails → it stays local (or is dropped).

Promotion is the DOMAIN path of the three-way routing convention — a promoted capability is
a domain learning, never a spine fix and never a project fact. See
`plugin/docs/process/updates-routing.md` for how FRAMEWORK / DOMAIN / PROJECT updates route.

## Flow

1. **Author project-local**, usable immediately.
2. **After the first successful real use**, an agent files `mcp__ui__promote { kind, name, reason }`
   → it lands on the promotions board (`.xenomoon/promotions.json`). The orchestrator runs the
   rubric and **offers** promotion to the human — it never auto-promotes. Agents never move files
   themselves.
3. **On approval**, the human runs in the forge:
   `npm run promote -- --pending` (or `npm run promote -- <skills|agents|tools|library> <name>`).
   The file move is `promoteOne` in `ui/server/features/promotions/promote-run.js`: the capability
   moves into `plugin/<kind>/` and re-materializes to every install.
4. **Fails the rubric** → stays local.

## The contamination gate

`plugin/` ships into EVERY install, so a promoted capability must carry NO project-specific facts.
`ui/server/features/promotions/contamination.js` is the deterministic scanner run at BOTH seams —
`promote` (the project→plugin boundary) and `validate` (`cli/gen-contamination.js`, catching
capabilities authored direct-to-plugin, bypassing promote). It flags only low-false-positive,
deterministic signals: hardcoded absolute paths, sibling-project refs (`../<project>`), provenance
tied to one repo/project, the bound project's derived proper-noun denylist (dir basename +
`package.json` name), and verbatim business-rule / data-model leaks from the project's `CLAUDE.md`.
Fuzzy proper-noun judgment past the denylist stays the human/audit's job. `--force` overrides. The
`res://` checks are engine heritage (inert for node projects) and run for TOOLS only — see below.

## Exception — clearly-general agents

An agent whose generality is unambiguous (it serves _any_ project, with zero project coupling) may
be authored **directly in the plugin as provisional**, skipping the local-prove step — because
agents are centralised in `plugin/agents/` and there is no project-local `.claude/agents/` path
where such an agent would otherwise be proven. Mark it provisional in its description until a real
use confirms it. This exception is for **agents only**, and only when criterion 1 (General) is
beyond doubt; skills and tools still follow the prove-local-first flow.

## Tool domains — universal vs project

`tools/` is **materialized into every install** (`materializeTools`, `ui/server/cli/materialize.js`
copies the whole `plugin/tools/` directory in on server start / `doctor` / `forge new`). So a tool's
**domain** decides where it may live:

- **Universal** — hardcodes NO project-specific resource path. Its inputs come from a parameter or
  the manifest, so it resolves in any checkout. Universal tools live in `plugin/tools/` and
  materialize everywhere.
- **Project** — hardcodes a resource only one project has. **Project-domain tools stay in the
  project's `tools/` and are never promoted.**

**Why it matters:** a project-domain tool promoted into `plugin/tools/` is copied into _every_
install, where the resource it references does not exist, so that install's validation gate fails
on the missing resource. (Because materialize is **additive** — it never prunes — removing such a
tool from the plugin stops fresh copies but leaves a stale copy in already-materialized installs;
delete that copy once by hand.)

**The guard:** `promoteOne` rejects a `kind: "tools"` promotion whose source hardcodes a
non-universal engine resource path (`res://…(.tscn|.tres|.glb|…)` — engine heritage, TOOLS-only).
To promote a useful project tool, **parameterize its resource first** (read it from an arg / the
manifest so it has no hardcoded path), then re-promote.

## Updating an existing core file

`promote` only ADDS new capabilities — it never UPDATES a file already in the plugin. To improve a
materialized core tool/skill/agent, edit it in the plugin directly (it re-materializes to every
install); keep project-specific bits in a project-local extension that sources the core.

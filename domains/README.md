# Domain packs

A **domain pack** retargets this framework from one kind of work to another (React/Node web apps
today; Salesforce, etc. next) without forking the spine. The spine (`ui/`, `.claude/`, the CORE
`plugin/`) stays domain-agnostic and reads per-domain values from the active pack via
`ui/server/core/domain-resolver.js`. This whole directory is **additive** — upstream owns nothing
here, so it never causes a merge conflict on a sync.

Godot is NOT a domain here. It stays the exclusive upstream product (`arthur0n/xenodot-forge`); this
fork pulls only domain-agnostic improvements (curated), so the engine payload never lands.

## Selecting the active domain

The project's lock (`.xenomoon-project.json`, written by `forge new --domain <name>`) is
**authoritative**. With no lock: `XENOMOON_DOMAIN` env → the framework's `.xenomoon.json` `"domain"`
key. There is **no silent default** — an unbound project fails loudly, so it is never driven as the
wrong domain.

## What a pack declares (`domains/<name>/domain.json`)

| Field                                       | Used by                | Meaning                                                          |
| ------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| `engine.name` / `engine.projectFile`        | `config.js` (`ENGINE`) | runtime name + on-disk project marker                            |
| `inventory.scenes` / `.scripts` / `.ignore` | `project-state.js`     | file extensions the live inventory scans, plus dirs to skip      |
| `plugin`                                    | `session.js`           | the domain's capability plugin (loaded alongside CORE `plugin/`) |
| `orchestrator`                              | `config.js`            | the routing prompt loaded into the session                       |
| `commands`                                  | `gen-manifest.js`      | build/verify commands written into the manifest                  |
| `populated`                                 | `doctor.js`            | ships capabilities (hard checks) vs. learns the project          |
| `materializeIntoProject`                    | `materialize.js`       | write framework files into the project tree (default false)      |

A pack may also ship `templates/CLAUDE.md` — a project-facts template `forge new` seeds into a
freshly-bound project (falling back to the CORE neutral `plugin/templates/CLAUDE.md`; an existing
`CLAUDE.md` is never overwritten).

## Shared CORE infrastructure (free to every pack)

Beyond what a pack declares, every session inherits the spine's shared capabilities — the
cross-session task board, the promotions graduation path, autonomous mode, the user-ask channels, and
the seeded convention floor. A pack's `orchestrator.md` should **use** these, not reinvent them. See
[`plugin/PATTERNS.md`](../plugin/PATTERNS.md).

## Shipped packs

- **`webapp`** — a populated HEAD-START for React + Node apps: an issue-driven, human-gated pipeline
  (`designer → analyst → developer → tester → reviewer`; the `/feedback /design /analyze /implement
/qa /audit /commit /build /uat` commands). The orchestrator then learns the specific project and
  promotes broadly-useful capabilities back into the pack for the next project.
- **`app`** — an empty Node learning pack (ships no pre-baked capabilities; learns the project).

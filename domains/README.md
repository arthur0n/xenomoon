# Domain packs

A **domain pack** retargets this framework from one kind of work to another (React/Node web apps
today; Salesforce, etc. next) without forking the spine. The spine (`ui/`, `.claude/`, the CORE
`plugin/`) stays domain-agnostic and reads per-domain values from the active pack via
`ui/server/core/domain-resolver.js`. This whole directory is **additive** — upstream owns nothing
here, so it never causes a merge conflict on a sync.

Godot is NOT a domain here. It stays the exclusive upstream product (`arthur0n/xenodot-forge`); this
fork pulls only domain-agnostic improvements, and `scripts/strip-godot.mjs` keeps it Godot-free.

## Selecting the active domain

The project's lock (`.xenomoon-project.json`, written by `forge new --domain <name>`) is
**authoritative**. With no lock: `XENOMOON_DOMAIN` env → the framework's `.xenomoon.json` `"domain"`
key. There is **no silent default** — an unbound project fails loudly, so it is never driven as the
wrong domain.

## What a pack declares (`domains/<name>/domain.json`)

| Field                                       | Used by                | Meaning                                                          |
| ------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| `engine.name` / `engine.projectFile`        | `config.js` (`ENGINE`) | runtime name + on-disk project marker                            |
| `engine.needsBinary`                        | `config.js`            | engine runs via an external binary (false for Node)              |
| `inventory.scenes` / `.scripts` / `.ignore` | `project-state.js`     | file extensions the live inventory scans, plus dirs to skip      |
| `plugin`                                    | `session.js`           | the domain's capability plugin (loaded alongside CORE `plugin/`) |
| `orchestrator`                              | `config.js`            | the routing prompt loaded into the session                       |
| `commands`                                  | `gen-manifest.js`      | build/verify commands written into the manifest                  |
| `populated`                                 | `doctor.js`            | ships capabilities (hard checks) vs. learns the project          |
| `materializeIntoProject`                    | `materialize.js`       | write framework files into the project tree (default false)      |

## Shipped packs

- **`webapp`** — a populated HEAD-START for React + Node apps: an issue-driven, human-gated pipeline
  (`bug-triage → senior-dev → developer`; the `/feedback /triage /solution /implement /build`
  commands). The orchestrator then learns the specific project and promotes broadly-useful
  capabilities back into the pack for the next project.
- **`app`** — an empty Node learning pack (ships no pre-baked capabilities; learns the project).

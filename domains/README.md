# Domain packs

A **domain pack** retargets this framework from one kind of work to another (React/Node web apps
today; Salesforce, etc. next) without forking the spine. A domain is an **install-time picker**:
`install-project --domain <name>` COPIES the picked pack's capabilities into the framework's single
`plugin/` tree and BAKES its descriptor into `.xenomoon.json`; at runtime the spine (`ui/`, `.claude/`,
`plugin/`) reads only that baked descriptor via `ui/server/core/config.js` — never a live pack, and
`ui/server/core/domain-resolver.js` runs at install only. This whole directory is **additive** —
upstream owns nothing here, so it never causes a merge conflict on a sync.

Godot is NOT a domain here. It stays the exclusive upstream product (`arthur0n/xenodot-forge`); this
fork pulls only domain-agnostic improvements (curated), so the engine payload never lands.

## Picking the domain (install-time only)

A domain is chosen **once, at install** — `install-project --domain <name>`
(`ui/server/cli/install-capabilities.js`) copies the pack into `plugin/` and bakes its descriptor into
the framework's `.xenomoon.json` (`domainDescriptor`); the pick is also recorded there as `"domain"`.
At runtime `config.js` reads that baked descriptor — nothing re-resolves a pack, and there is **no
silent default**: an unbound framework has no baked descriptor to read.

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
- **`expo`** — a populated React Native / Expo pack: the `uat-runner` agent, the `/uat` command, and
  Android/iOS local-run, local-UAT, identity and Play-ship skills.
- **`app`** — an empty Node learning pack (ships no pre-baked capabilities; learns the project).

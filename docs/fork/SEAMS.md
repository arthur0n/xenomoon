# Seams — our conflict-surface contract with upstream

To stay mergeable with a fast-moving upstream, **~95% of our fork work lives
in NEW files/dirs upstream never touches.** This file is the audited list of the few
exceptions: upstream-owned files we edit, and the rename map the rebrand codemod
applies.

> **The trunk is rebranded (committed).** Our `main` trunk is xenomoon end-to-end, so the rebrand modifies
> _most_ upstream files — not just the behavioral seam edits in the table below. On an upstream
> merge, expect conflicts on rebranded identifier lines too; resolve them and re-run
> `scripts/rebrand.mjs` (see `SYNC.md`). The table below still tracks our **behavioral** seam edits
> — the ones to re-apply with care — separate from the blanket rename.

## Additive-only areas (no conflict risk — upstream owns none of these)

- `docs/fork/**` — this contract, the sync runbook.
- `scripts/rebrand.mjs` — the rebrand codemod; `.claude/commands/sync-upstream.md` — the
  analysis-driven up-sync command that drives it (replaced the old blind `scripts/sync-upstream.sh`).
- `domains/**` — the domain packs. The shipped packs are `domains/app/` and `domains/webapp/`
  (Node / React, empty learning starters). The upstream we track is a Godot framework, but
  Xenomoon ships **no** godot domain, plugin, or engine binary.
- `ui/server/core/domain-resolver.js` + `ui/server/cli/install-capabilities.js` — the INSTALL-time
  domain picker: `forge new --domain X` copies pack X's capabilities into `plugin/` and bakes X's
  descriptor into `.xenomoon.json`. At runtime the spine reads the baked descriptor, never `domains/`.
  New files → no conflict.

## Upstream files we are allowed to edit (keep this list SHORT)

Each entry = the smallest possible change, ideally a one-line hook into our additive
code, plus why it's unavoidable.

| File                                   | Edit                                                                                                                                                                | Why it can't be additive                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `package.json`                         | Add one `scripts` entry: `"rebrand": "node scripts/rebrand.mjs"`.                                                                                                   | npm scripts must live in the manifest. One line, low churn.                                  |
| `ui/server/core/config.js`             | Import the resolver; resolve + export `DOMAIN`; source the `ENGINE` name/projectFile **defaults** from `DOMAIN.engine` (env / `.xenodot.json` overrides unchanged). | `ENGINE` is the central resolved config the spine shares; the domain must feed its defaults. |
| `ui/server/core/http/project-state.js` | Import `DOMAIN`; scan `DOMAIN.inventory.scenes` / `.scripts` instead of upstream's hardcoded literal extensions.                                                    | The live inventory is computed here; extensions are per-domain.                              |
| `ui/server/cli/new.js`                 | Resolve the domain; detect `DOMAIN.engine.projectFile` and scaffold `DOMAIN.starter` instead of upstream's hardcoded project marker / starter.                      | Scaffolding picks the project marker + starter, which are per-domain.                        |

| `ui/server/cli/doctor.js` | Capability + `validate.sh` checks are HARD only when `DOMAIN.populated`; an empty domain installs/runs cleanly. | Doctor gates `new`/CI; emptiness is a legal starting state for a learning domain. |
| `ui/server/cli/gen-manifest.js` | The manifest `commands` block ← `DOMAIN.commands`. | Build/verify commands are per-domain. |
| `README.md` | **Fully replaced** with a xenomoon front page (what it is / what we're trying to do / where we are). Upstream-name refs kept on `arthur0n` lines so the rebrand codemod preserves them. | Our product's front page — fully diverged. Expect conflicts on upstream README changes; resolve by keeping ours. |
| `ui/server/features/skills/skill-registry.js` | Replace the hardcoded `BUILDERS` list with a read of the active domain's `builders` (via the side-effect-free `domain-resolver`). Each domain pack declares its own `builders` (additive). | The `builders` skill-audience token (upstream's skills subsystem) must resolve per-domain, not bake one domain's builder agents into the spine. |

Each value above is sourced from the active domain pack rather than hardcoded, so the spine
carries no domain-specific literals (the onboarding gate proves a clean install/run). The
`config.js` and `new.js` rows have since grown: `config.js` also resolves `DOMAIN` from the
**project lock** (`.xenodot-project.json`, authoritative, mismatch-refused) and sources
`FRAMEWORK_PLUGIN_DIR` + `ORCHESTRATOR_PROMPT` from it; `new.js` is now the deterministic
`--domain` install (writes the lock, wires non-greenfield).

### Deferred seams (degrade harmlessly, route later)

- `ui/server/core/session.js` — loads the framework's ONE capability plugin (`config.js`
  `FRAMEWORK_PLUGIN_DIR` = `plugin/`, now an alias of `CORE_PLUGIN_DIR`). The domain picker already
  merged the pack into `plugin/` at install, so there is no second runtime plugin to load.
- Engine-binary probing — only domains whose `engine.needsBinary` is true resolve an external
  binary; Node/web domains drive their toolchain through package scripts and need none.
- `gen-manifest.js` render block + the INI project-marker parsing — only meaningful for an
  engine that uses an INI marker; yields empty facts for other domains (fine for now).
- Inventory field **labels** (`scenes` / `scripts`) in `project-state.js` + the client.
- Per-project **library** isolation — `materialize` symlinks the shared plugin library; full
  per-project independence (two app projects → separate learned libraries) is a later increment.

### Intentional upstream divergences (re-apply on every sync)

These are upstream additions we deliberately do NOT carry. Each merge that re-introduces them must
re-drop them (the merge brings them back because lineage is preserved — that's by design).

- **godot-docs (upstream `000f4b7`) — NOT carried.** The opt-in Godot-docs MCP + `godot-docs-evangelist`
  agent is godot-specific (upstream-only) and pulls the `@nuskey8/godot-docs-mcp` dependency — no value
  for our Node/web domains. On every merge that re-introduces it, re-run the drop:
  - delete `plugin/agents/godot-docs-evangelist.md`, `plugin/skills/godot-docs/`, `ui/docs-block.md`;
  - back out the `DOCS_*` / `getDocsConfig` / `docsPublicConfig` / `saveDocsConfig` / `mcp__godot-docs__*`
    wiring in `config.js`, `session.js`, `index.js`, `types.js`, `settings.js`, `index.html`,
    `project-state.js`, and the `godot-docs` tools + skill from the six builder agents;
  - drop the `@nuskey8/godot-docs-mcp` dep (`package.json`) and regenerate the lock (`npm install`);
  - **KEEP** `ui/server/mcp-tools/ui-server.js` (the domain-agnostic `buildUiServer` the merge depends on).
  - Sweep: `git grep -i 'godot-docs\|nuskey8\|DOCS_BLOCK'` must be clean (outside this doc).
    Revisit only if a domain wants its own docs-MCP — then generalize it into a per-domain seam.
- **FEATURES.md — NOT carried.** Upstream's godot-feature catalog (un-curated for xenomoon); re-curate
  on its own terms if ever wanted.
- **Identity (bronze "lunar") — never revert to upstream's look.** Keep the ringed-planet emblem
  (mark/logo/favicon) + Lunar-Bronze / Moon-Gold palette in `ui/agent-ui.css` (the `--green` token is
  Moon Gold, NOT green) + brand word "XenomoonForge". On any sync touching `ui/index.html`,
  `ui/agent-ui.css`, or emblem/favicon assets, take upstream's behavior/structure only and resolve
  every color/identity hunk as OURS. Keep our settings glyph `⚙` (drop upstream's `🎛️`).
- **Godot skills / agents / library (e.g. `dba53ce`) — NOT carried.** Re-drop on every merge:
  `plugin/skills/godot-*`, `plugin/agents/{game-designer,level-designer,godot-*}.md`, and ALL of
  `plugin/library/` EXCEPT our two CORE files (`README.md`, `token-audits/LEDGER.md`). KEEP the
  domain-agnostic wins separately (e.g. the Hermes learning-nudges in `ui/server/mcp-tools/hermes-tool.js`).
- **grep-usage-log hook — NOT carried.** Overlaps our `rtk-usage-log.sh`; drop
  `plugin/hooks/grep-usage-log.sh` + its `Bash|Grep` PreToolUse entry in `plugin/hooks/hooks.json`.
  KEEP `plugin/hooks/graphify-update.sh` (the opt-in graphify auto-refresh) and the `graphify` skill.
- **UI port stays `3117`.** Upstream defaults to `8338`; re-apply `3117` in `ui/server/core/config.js`
  - `ui/smoke-test.js` on every sync. Our `start_server`/`stop_server` (`.xm-run/`) stay OURS.
- **Godot engine tooling / `engine-bin.js` — NOT carried (added at the v0.2.x sync).** Upstream keeps
  the engine binary probe + `.gd`/shell game tools; we purged them. Re-drop on every merge:
  `ui/server/core/engine-bin.js` and all of `plugin/tools/` (the `.gd` capture/gen/verify scripts +
  `playgrade.sh`/`smoke_scene_*` helpers + `CAPABILITIES.md`). The `check:agnostic` gate fails on the
  `.gd` files, so it catches a missed re-drop. Also drop stray godot art (`assets/VoidInk_style.md`,
  `assets/fps_poc.png`).
- **Game feature dirs — NOT carried (added at the v0.2.x sync, upstream v0.2.0).** The res:// asset
  library + level editor are game-only. Re-drop `ui/server/features/{assets,levels}`,
  `ui/client/features/{assets,level-editor}`, `ui/server/mcp-tools/asset-tool.js`, and remove their
  wiring from the took-theirs `ui/server/mcp-tools/ui-server.js` (`makeAssetTool`) +
  `ui/client/core/main.js` (`initGetAssets`/`initDrawLevel`). Keep our OURS `ui-server.js`/`main.js`.
- **New game agents / skills — NOT carried (v0.2.x).** Drop `plugin/agents/{bug-triage,art-director,
asset-advisor,addon-researcher}.md` (game roles) and `plugin/skills/level-design-principles/`. Fix
  any kept skill/agent frontmatter that references a dropped agent (e.g. `research-presenting` audience
  → keep only `{cli,skill,transcript}-researcher`; `agent-report`/`graphify` → drop `bug-triage`).
- **Deferred v0.2.x subsystems — NOT YET adopted (kept the sync coherent + green).** These are real
  agnostic-leaning wins entangled with upstream's server-core refactor; adopting them cleanly is its
  own effort, so this sync took OURS core and dropped them. Re-evaluate each in a dedicated pass:
  upstream's **server-core refactor** (`ui/server/core/{connection,registry,agent-settle}.js` + the new
  session/config wiring), the **`compact-tool`**, the **`node:test` suite** (all `*.test.js` + the
  `find … -name '*.test.js'` test script), the **contamination gate** (`gen-contamination.js` +
  `features/promotions/contamination.js`), **`codex-review.js`**, the **`fork` command**, and the
  **framework-audit self-improvement loop** (`.claude/commands/framework-*.md`, `.claude/framework-audits/`,
  the `framework-nobrainer-fixer` agent + `apply-nobrainers` workflow, `gen-ledger.js`). The last is the
  highest-value re-home candidate.

## Rebrand rename map (applied by `scripts/rebrand.mjs`, case-preserving)

| From                          | To                              |
| ----------------------------- | ------------------------------- |
| `xenodot`                     | `xenomoon`                      |
| `Xenodot`                     | `Xenomoon`                      |
| `XENODOT_` (env prefix)       | `XENOMOON_`                     |
| `xenodot:` (plugin namespace) | `xenomoon:`                     |
| `.xenodot.json` / `.xenodot/` | `.xenomoon.json` / `.xenomoon/` |
| `xenodots`                    | `xenomoons`                     |

A single case-preserving `/xenodot/gi` pass covers every form above.

## Rebrand denylist (must NOT be rewritten)

- **Any line containing `arthur0n`** — upstream provenance URLs
  (`github.com/arthur0n/xenodot-forge`, `raw.githubusercontent.com/arthur0n/...`,
  clone/marketplace instructions). Rewriting these would break the `upstream` remote
  references and point forkers at a repo that doesn't exist.
- **Untracked / gitignored files** — the codemod runs over `git ls-files` only, so local
  state (`.xenodot.json`, `logs/`, `node_modules/`, `vendor/`, a nested game dir, materialized
  `tools/`) is never read or rewritten.
- The codemod's **own machinery** — `scripts/rebrand.mjs`, `.claude/commands/sync-upstream.md`
  (the up-sync command, which re-runs the codemod as one of its steps), and everything under the
  `docs/fork/` folder — intentionally mentions the literal `xenodot` to document the rename,
  so it is skipped.
- **Binary assets** (images, fonts, models, archives) — skipped by extension and null-byte detection.

## Invariant

After `node scripts/rebrand.mjs`, `git grep -i xenodot` returns **only** the
denylisted `arthur0n` provenance lines and the skipped `docs/fork` + `scripts`
machinery. Anything else means the rename map or denylist needs updating.

# {{PROJECT_NAME}} — project facts

> Policy/routing lives in the active domain's orchestrator; this file is project FACTS only.
> Fill in every `{{…}}` placeholder; delete any section that genuinely doesn't apply.
> The framework's agents and orchestrator read this file and treat it as authoritative — it
> overrides their generic defaults. Keep it short and true; a stale fact is worse than none.

## Project overview

{{what it is — one or two sentences: who uses it, what it does}}

## Stack

- **Language / runtime:** {{e.g. TypeScript on Node 20, Python 3.12, Go 1.22}}
- **Key frameworks / libraries:** {{the few that actually shape the codebase}}
- **Data / storage:** {{db + access layer, or "none"}}
- **External services:** {{auth, queues, third-party APIs this depends on — or "none"}}

## Layout

- {{top-level dir → what lives there, one line each — the map a newcomer needs}}

## Commands

- **Install:** {{e.g. npm install}}
- **Dev / run:** {{how to run it locally}}
- **Build:** {{e.g. npm run build}}
- **Validate:** {{type-check + lint + tests in one, e.g. npm run validate}}
- **Test:** {{the unit runner}}

## Understanding the codebase (graphify)

This project can keep an optional knowledge graph in `graphify-out/` (gitignored, built by the
`graphify` CLI). For codebase / architecture / "how does X work" questions, query the graph FIRST
when `graphify-out/graph.json` exists — `graphify query "<question>"` (or `path` / `explain`)
returns a scoped subgraph, far smaller than raw grep. Auto-refresh after edits is **opt-in**
(AST-only, free): `touch graphify-out/.autoupdate` to enable, else run `graphify update .` after
big changes. No graph yet? `graphify .` builds one. See the `xenomoon:graphify` skill.

## Conventions / convention floor

Project-specific hard rules every change must respect (the agents obey these over their defaults):

- {{e.g. business logic lives in core/ — not in entrypoints/handlers}}
- {{e.g. no console.log / no `any` / no non-null `!`; lint runs with zero warnings}}
- {{e.g. config-driven — no magic numbers}}
- {{add the rules that are actually non-negotiable here}}

## Business rules / product facts

Standing facts about **what this product does / doesn't do** — captured product INTENT, in
the user's own words. **Designer-maintained, human-gated** (the `designer` agent proposes
additions during `/design` and writes them only after you approve). The framework's agents
treat this block as **AUTHORITATIVE intent** — they build and reason to it and never
manufacture an assumption that contradicts a rule stated here. Empty until the first
`/design` seeds it — quote the fact, don't paraphrase it.

- {{e.g. "We're not using the X columns — propagate the value instead."}}
- {{add each standing product rule verbatim as it's captured}}

## NEVER (project-specific)

- {{e.g. never commit secrets / env values}}
- {{e.g. never edit generated files by hand}}
- {{add any other hard "never" specific to this project}}

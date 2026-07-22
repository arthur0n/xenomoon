# Updates routing — FRAMEWORK vs DOMAIN vs PROJECT

Every finding, fix, or learning answers ONE question before it lands anywhere:

> **Is this a spine defect, a missing domain capability, or a project fact?**

Each scope has exactly ONE landing path. Routing a finding down the wrong path is how
learnings die in ledgers and spine hacks leak into domains — when unsure, ask the human.

## The three paths

**FRAMEWORK** — a defect or gap in the spine itself: a hook, the orchestrator machinery,
the server, a CORE skill/agent, a gate.
→ Lands in the **framework-audit ledger** (`.claude/framework-audits/`), is fixed by a
commit to the framework repo, and reaches every install via update (`git pull upstream`).
**Never via promotions** — promoting a spine fix into a domain pack hides it from every
other domain.

**DOMAIN** — a missing or wrong capability of the active domain: a technique worth a
skill, a verdict/finding worth a library record, an agent-prompt gap in the pack.
→ Drafted project-local (`.claude/skills/<name>/`, `.claude/library/<kind>/<slug>.md`),
filed on the **promotions board**, and — on human approval — lands in
`domains/<name>/plugin/{skills,library}/`. Optionally contributed upstream as a PR.
A newly promoted capability loads on the **next session** (the plugin roster is read at
session start — that session restart is cheap and by design; only a domain/project switch
needs a server restart).

**PROJECT** — a fact or rule of THIS project only: business rules, data-model facts,
naming conventions, "we don't use X".
→ Lands in the project's own `CLAUDE.md` (the Business rules / convention floor blocks)
or `.claude/skills/`. **Never leaves the project** — not promotable, not PR-able; the
contamination gate is the backstop, the human gate the guarantee.

## Decision table

| Symptom                                                      | Scope            | Landing path                                         | Who gates           |
| ------------------------------------------------------------ | ---------------- | ---------------------------------------------------- | ------------------- |
| A hook/gate misfired, orchestrator routed wrong, server bug  | FRAMEWORK        | audit ledger → framework commit                      | framework owner     |
| "Agents keep re-solving X in every webapp project"           | DOMAIN           | draft → promotions board → domain pack               | board approval      |
| A hard-won verdict/footgun worth remembering across projects | DOMAIN (library) | `.claude/library/` draft → board → `library/<kind>/` | board approval      |
| "In this project, column X is unused / flow Y is intended"   | PROJECT          | project CLAUDE.md business rules                     | human edit approval |
| A token-audit find that's really a missing domain tool       | DOMAIN           | via the audit's learn arm → board                    | board approval      |
| A token-audit find in the spine's own machinery              | FRAMEWORK        | audit ledger                                         | framework owner     |

## Fork users

Your fork's domain packs grow the same way — approvals land in YOUR checkout. Update by
pulling upstream; contribute generic learnings back as PRs (see `CONTRIBUTING.md`). On a
pull conflict inside `domains/**`: your local version wins; keep upstream's copy aside
(e.g. `<name>.upstream/`) and merge by hand. Give promoted capabilities descriptive slugs
to keep collisions rare.

# Updates routing — FRAMEWORK vs DOMAIN vs PROJECT

Every finding, fix, or learning answers ONE question before it lands anywhere:

> **Is this a spine defect, a missing domain capability, or a project fact?**

Each scope has exactly ONE landing path. Routing a finding down the wrong path is how
learnings die in ledgers and spine hacks leak into domains — when unsure, ask the human.

## The three paths

**FRAMEWORK** — a defect or gap in the spine itself: a hook, the orchestrator machinery,
the server, a CORE skill/agent, a gate.
→ A finding that is not fixed on the spot lands in the **framework-audit ledger**
(`.claude/framework-audits/`). A defect a session fixes lands as a pull request on the
framework repo: `issuekit framework-fix start <slug>` opens the branch `fix/<slug>` in the
install, and
`issuekit framework-fix submit --files <paths> -m "<message>" --title "<title>" --body "<body>"`
commits the named files (paths relative to the install root), pushes the branch and opens
the PR with the `spine` label. When a fix is already open, the command names its branch and
PR: add to that fix or wait. The owner merges the PR, and the fix reaches every install via
update (`git pull upstream`). The install that made the fix stays on the fix branch until the
PR is merged; then `git switch main` and `xenomoon update` bring it back. **Never a commit on `main` of the install** — an install with bound
projects refuses it. **Never via promotions** — promoting a spine fix into a domain pack
hides it from every other domain.

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
→ Lands in the project's library (`.claude/library/business-rules.md` / `project.md`,
with a one-line pointer in the project `CLAUDE.md` index) or `.claude/skills/`.
**Never leaves the project** — not promotable, not PR-able; the contamination gate is
the backstop, the human gate the guarantee.

## Decision table

| Symptom                                                      | Scope            | Landing path                                         | Who gates           |
| ------------------------------------------------------------ | ---------------- | ---------------------------------------------------- | ------------------- |
| A hook/gate misfired, orchestrator routed wrong, server bug  | FRAMEWORK        | `issuekit framework-fix` → PR on the framework repo  | framework owner     |
| "Agents keep re-solving X in every webapp project"           | DOMAIN           | draft → promotions board → domain pack               | board approval      |
| A hard-won verdict/footgun worth remembering across projects | DOMAIN (library) | `.claude/library/` draft → board → `library/<kind>/` | board approval      |
| "In this project, column X is unused / flow Y is intended"   | PROJECT          | `.claude/library/business-rules.md` + index line     | human edit approval |
| An efficiency find that's really a missing domain tool       | DOMAIN           | draft → promotions board → domain pack               | board approval      |
| An efficiency find in the spine's own machinery              | FRAMEWORK        | audit ledger, or `issuekit framework-fix` when fixed | framework owner     |

## Fork users

Your fork's domain packs grow the same way — approvals land in YOUR checkout. Update by
pulling upstream; contribute generic learnings back as PRs (see `CONTRIBUTING.md`). On a
pull conflict inside `domains/**`: your local version wins; keep upstream's copy aside
(e.g. `<name>.upstream/`) and merge by hand. Give promoted capabilities descriptive slugs
to keep collisions rare.

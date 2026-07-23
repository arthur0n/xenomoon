# Install & Learn — the self-improving framework plan

The goal, in one line: **a user installs the framework once, binds their projects, and the
DOMAIN learns from every project — with the project never pushing anything, and learnings
flowing back to the community as PRs.**

Status: PLAN — written before implementation, so anyone (owner, friends testing, fork
users) can read where this is going. Case study for every step: **lexflow** (the bound
webapp project) + **xm-probius** (the retired fork experiment that exposed the problems).

## The model

- **Project = source of experience, never a git actor.** It hosts no framework files,
  pushes nothing, stays pure. (lexflow never gains a framework remote or profile duty.)
- **Domain = the unit that learns.** Working on ANY webapp project grows
  `domains/webapp/` (skills, library records, conventions) in the LOCAL install. A second
  bound project benefits immediately — same checkout, same domain.
- **Install = fork of `arthur0n/xenomoon`.** The fork gives the user: easy update
  (`git pull upstream main`) and a PR path for their domain learnings. No fork, no
  rebrand — a plain fork.
- **The learning is a PROCESS the framework ships,** not a habit the user must have.

## 1 · Fork / PR contribution flow

- Users fork `xenomoon`, bind their projects, work. Their approved learnings land in
  their fork's `domains/<name>/`.
- **PR path:** a shipped command (`/contribute` or `forge contribute`) that stages ONLY
  domain-pack learnings (skills, library records — never `.xenomoon.json`, never project
  facts) onto a branch and opens the PR against `arthur0n/xenomoon`.
- **Owner dogfoods the same flow:** learnings from lexflow go through the identical
  promote → domain → (branch + PR or direct commit) path. If the flow is annoying for
  the owner, it's broken for users.
- **PR gate (CI):** validate + `check:agnostic` + `check:agents` + the promotion
  contamination check run on every PR, so a domain PR from a fork is machine-checked
  before human review. Extend `.github/workflows/onboarding.yml` or add `pr-domain.yml`.
- `CONTRIBUTING.md`: documents exactly this — what is PR-able (domain learnings), what
  never is (project data, business rules, `.claude/` local config).

## 2 · Install & configure (first-run experience)

One guided flow, run once — `npm run setup` (extend the existing `setup.js` + skill-setup
wizard) or first server boot:

- **Ask everything UP FRONT, once** (the "ask first" debt): which domain, project path,
  and whether the user has **Hermes / Codex / Kimi** — offer to configure each
  (`hermes:setup` / `codex:setup` / kimi) inline, or skip cleanly. No mid-work surprise
  prompts.
- **Kill the restart-tax:** today enabling an agent, changing hermes/codex/kimi config,
  or editing the orchestrator requires a manual server restart (several times during
  setup). Fix: the server exposes a **restart-self endpoint** (`POST /api/restart`, UI
  button "apply & restart") and the setup flow ends with one single restart, not N.
  Config reads that can be made per-session (like `getHermesConfig` already is) should
  be, so fewer things need a restart at all — audit which reads are startup-frozen
  (`ORCHESTRATOR_PROMPT`, blocks, plugin list) and re-read them per session where cheap.
- **`forge doctor` covers integrations:** one command that verifies node, gh auth,
  domain lock, graphify CLI, hermes/codex/kimi readiness, and the paid-agents portal —
  with a fix-hint per red row.

## 3 · Folder conventions (mostly right — keep, document, one cleanup)

- KEEP: `plugin/` = CORE plugin (loaded every session) · `domains/<name>/plugin/` = the
  domain's plugin · `domains/<name>/plugin/library/` = the domain's learned records ·
  `ui/` = server + web app · `docs/`, `scripts/` = repo meta.
- DOCUMENT it in the README top (one diagram) — the `plugin/` vs `domains/*/plugin/`
  naming confuses newcomers; a rename is NOT worth the churn, a diagram is.
- **Owner cleanup (case study):** xm-probius / the Pexelins remote is retired. It was a
  fork-pattern fork used as an install — wrong layer. Steps: archive
  `Pexelins/xenomoon` (read-only), salvage nothing (all framework content is superseded;
  fork-local audit ledgers stay archived with it), remove local remotes/credential pin,
  bind lexflow from the real checkout. Fresh installs use the fork flow above.

## 4 · The learning loop (the core)

A shipped, domain-agnostic process — not forge-local:

1. **During work** (already exists): agents record project-local learnings
   (`.claude/skills`, CLAUDE.md business rules); `mcp__ui__promote` files promotion
   candidates; the orchestrator's self-improvement rules apply.
2. **`/learn` — the distiller (new):** after real work lands (issue closed, PRD
   delivered, UAT run), mine what happened — ANALYSIS verdicts, QA divergences, fix
   patterns, PRD decisions, session friction — and DRAFT either:
   - a **skill** (repeatable technique worth preloading), or
   - a **library record** (verdict / finding / footgun — `library-record-writing`
     format), or
   - a **convention line** (project CLAUDE.md floor — stays project-local).
     Each draft → the promotions board. Nothing lands silently.
3. **Human approves** on the board (the one gate) → `promote` moves it into
   `domains/<name>/plugin/{skills,library}/`. The domain grew; no git action needed.
4. **Optionally contribute:** `/contribute` turns accumulated domain learnings into a PR
   (section 1). Owner pushes directly.

**The audit loops join in** (owner request): `/framework-audit`, `/token-audit`, and
`/harvest-sessions` each gain a **learn arm** — when a finding's fix is really a missing
domain capability (not a spine bug), the fix lands as a domain skill/record through the
same promotions gate instead of dying in a ledger row.

**Privacy boundary (hard rule):** the contamination gate extends to `/learn` and
`/contribute` — business rules, data-model facts, anything project-identifying NEVER
leaves the project or enters a PR. Only generic, reusable technique does.

## 5 · Case study — how we prove it

1. Retire xm-probius (section 3 cleanup); bind lexflow from this checkout.
2. Run one real issue end-to-end here (designer → analyst → … → commit).
3. Run `/learn` on it — expect at least one webapp skill or library record drafted from
   the Explicação/propagate saga + the jsdom lockfile incident.
4. Approve on the board → verify it lands in `domains/webapp/plugin/`.
5. Open the PR for it ourselves (dogfooding section 1) — even though we could push
   directly.
6. A friend forks, installs with the section-2 flow, binds their webapp project, and the
   first thing they see includes what lexflow taught the domain.

## Additions proposed by the implementation agent (approve/strike)

- **Release channel for installs:** tag releases + a CHANGELOG; `forge update` = fetch
  upstream + show the migration notes between the user's tag and HEAD. Fork users need
  to know WHEN to pull and what changed.
- **Domain versioning:** a `version` in `domain.json`, bumped by promotions — makes
  domain PRs reviewable and installs comparable.
- **Session-safe config:** the audit in section 2 (startup-frozen vs per-session reads)
  filed as its own tech-debt item — it is what makes most restarts unnecessary.
- **Multi-project profiles (`npm run up`) stay** — orthogonal convenience for running
  several binds; NOT part of the learning story.

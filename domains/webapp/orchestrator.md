# Web app domain block — React + Node.js web app (head start)

The spine above is the doctrine and owns the path of an issue (the flow); this block is the
webapp domain, which then **learns this project** as you work. Agent namespace:
`xenomoon-webapp:<name>` (also reachable by bare name); the CORE `product-owner` loads alongside
this pack (`xenomoon:product-owner`). The session additionally DENIES raw `gh issue` — issue
writes go through `issuekit` and the flow's steps.

The project's facts (stack, conventions, commands, infrastructure) live in the project's library
(`.claude/library/`), indexed by the project's own `CLAUDE.md` — read the index, follow its
pointers, obey them, and let them override these defaults. The full agent roster (model · effort ·
when-used · cost) is in `docs/ROSTER.md` at the framework root.

## Domain routing

- **A framework defect** (a hook, a gate, the server, a CORE skill) is not worked around in the
  project and is not committed on the install's `main`. Fix it on a branch with
  `issuekit framework-fix start <slug>`, then publish it with
  `issuekit framework-fix submit --files <paths> -m "<message>" --title "<title>" --body "<body>"`
  (paths relative to the install root), which opens the PR. You never merge that PR.
- **Your shell is for routing state only** — labels, run status, `git status`, board and
  config reads: the facts that pick a route. The moment a command would read SOURCE to
  form a hypothesis about a cause, that command is a step's job — dispatch it.
- Infra and CI changes (`.github/`, IaC) run the same flow; they are code like any other.

## Build, smoke, deploy

Run the project's own commands, and know which is which:

- **build** (default) — the production build, plus validate if it has not been green this
  session. For quick iteration the dev servers are enough; no rebuild needed.
- **smoke** — the project's `smoke` command: the data API against the real DB, after a backend
  or schema change. Acceptance is NOT this — that is the Proof step, run by the `uat-runner`.
- **deploy — never from here.** Deploy happens by pushing the main branch; CI does the cloud
  work, and a manual `sam deploy` / `wrangler deploy` is forbidden (shared cloud account, OIDC
  role). Watch the run with `gh run list -R <repo> --branch <main> --limit 5` then
  `gh run watch -R <repo> <id>`; a run that died before the credentials step made no cloud
  change. A project can gate the deploy on the flow's verdicts: `plugin/docs/process/ci-qa-gate.md`.

## Review and Codex — the webapp deltas

- **This stack's usual suspects** — data scoping / tenancy leaks, the auth adapter boundary, and
  enum/label drift — are passed as focus for the Review step.
- **Codex bills on OpenAI's account** (the user's own, not the Anthropic plan) and is slow, an
  `audit` the slowest of all — so say that you are launching a billed review, and which kind,
  before you start it.

## Commit gate

The `commit-gate` hook decides every `(#N)` commit: it allows one only when the issue carries
`qa:pass` + `review:pass`, no `qa:blocked` / `review:changes`, and the newest verdicts'
`qa-verified:` / `review-verified:` SHAs equal the commit's parent (current HEAD). A pass earned
on other code is denied ("verified at `<a>`, committing on `<b>`"); a verdict with no marker
becomes a human ask. `commit-label` then stamps `committed` + `fixed-pending-deploy` and drops
`needs-deploy`. On a gate miss, name the failing condition — never force.

## Proof in a browser (the method of the Proof step)

The `uat-runner` runs the proof; the lane lives in the `webapp-uat` skill.

- **The `Proof:` line of the contract says how.** A look at a named page through the browser, or
  the project's own test script.
- **A look:** the runner selects the project's Chrome profile by the id in `browser.deviceId` of
  `.xenomoon/settings.json` and uses the sign-in that profile already has. A missing or
  unconnected id is "setup not ready".
- **The script:** the project's `e2e` script only. Caps: headless, one worker, chromium-only, no
  retries, strict timeouts. The saved `storageState` is how it is signed in.
- Neither way automates a sign-in form.

## Background — domain specifics

- A backgrounded builder writes its full report to `.xenomoon/handoffs/<slug>.md` and relays
  only `<path> — gate PASS|FAIL` (a SubagentStop hook enforces the short form); read the
  gate-first file directly, no summarizer hop.
- The `product-owner` is foreground only (it round-trips `mcp__ui__form`).
- Commit is a serialized single step: never run it alongside a builder on the same tree.

## Self-improvement — domain specifics

The spine's debrief-queue, library-index, and promotion doctrine apply; on top:

- **Capture is a side effect, not a ceremony.** The durable fact is captured as part of
  the producing agent's normal output — no separate "learn"-style step. The `product-owner`
  (foreground, Write-capable) writes the library doc and its index line itself, human-gated. A
  read-only producer (an analyst) or any BACKGROUND producer only **proposes** the exact line in
  its normal output (comment / handoff / `mcp__ui__ask`); **you** land it foreground after the
  human approves. Never let an agent shell around its missing Write tool.
- **`design/` is temporary.** Design docs (PRDs, slices, research notes) are build
  artifacts scoped to in-flight work. Graduation is not a step of an issue: after Commit you
  note it as one line on the owner's list and go on to Publish. When the owner asks for it, you
  run it as separate foreground work, never inside a fix commit: durable facts inside the design
  doc graduate to `.claude/library/` with an index line (human-gated), and the doc moves to
  `design/archive/<slug>.md` (never deleted — issues link their PRDs). A design doc is never the long-term home of
  a business rule.

## Convention floor + captured intent (read the index, follow the pointers)

This pack ships **no** baked-in convention floor — every project has its own. Before
routing or accepting a change, read the project's **`CLAUDE.md`** — terse facts (commands,
the **Hard rules**, the **Conventions** index) plus an INDEX — and follow its pointers into
**`.claude/library/`** for the full content: the **business-rules doc**
(`.claude/library/business-rules.md`) and the extended project-details doc
(`.claude/library/project.md`). Those are authoritative and override your defaults. The
business-rules doc is captured **intent**; a symptom-vs-intent conflict is a product
question, not a code trace. (An older project may still carry a full
`## Business rules / product facts` block inside `CLAUDE.md` — treat it the same, and
migrate it to the library doc + index line when the `product-owner` next touches it.)

A test is the floor: a hermetic **unit** test for isolatable logic, a **smoke / integration**
test for data-API paths.

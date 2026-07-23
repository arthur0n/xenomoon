# Install & Learn — implementation plan

## Context

Requirements doc: `docs/roadmap/install-and-learn.md` (committed, owner-approved) + three owner
refinements: (A) three-path routing convention — every finding classifies `framework | domain |
project`, each scope has exactly ONE landing path; (B) AI-assisted install onto existing
Claude-using projects; (C) path validation instead of folder conventions; (D) written repo-boundary
doc. Verified blockers from exploration: promotions have NO `library` kind (enum hardwired in 4
files); contamination scanner is godot-era (stale GAME_CODENAMES, checkMapping never runs on
promotable kinds — catches zero webapp business-rules leakage); `domains/webapp/plugin/{skills,
library}/` don't exist though `XENOMOON_LIBRARY` points there; NO restart mechanism exists; doctor
checks no integrations; `check:agnostic` silently absent from validate AND CI (onboarding.yml
comment falsely claims it runs); install asks are fragmented over 4 surfaces.

## W1 — Conventions first (S) — pure docs, unblocks W3/W6

- CREATE `plugin/docs/process/updates-routing.md` (shipped): the three-path classifier —
  FRAMEWORK (spine defect → framework-audit ledger → repo commit → installs via update; never
  promotions) · DOMAIN (missing capability → promotions board → `domains/<name>/plugin/{skills,
library}` → optional PR) · PROJECT (project fact → project CLAUDE.md/.claude — never leaves).
  Decision table: symptom → scope → landing path → who gates.
- CREATE `plugin/docs/process/repo-boundary.md`: why separate repos; project hosts ONLY the lock,
  its own CLAUDE.md/conventions/design/, `.claude/` local, gitignored `.xenomoon/`.
- MODIFY `README.md` (folder diagram: `plugin/` vs `domains/*/plugin/` explained),
  the three audit commands (`.claude/commands/{framework-audit,token-audit,harvest-sessions}.md` —
  insert "Classify the scope" step linking updates-routing.md), `plugin/docs/process/promotion.md`
  (cross-link).

## W2 — Library kind + contamination modernization (M)

- W2a scaffolds: CREATE `domains/webapp/plugin/skills/` (README), `domains/webapp/plugin/library/`
  — README + kind indexes for webapp kinds `findings/ verdicts/ tools/` (drop godot addons/
  transcripts). Makes `XENOMOON_LIBRARY` (config.js:145) resolve.
- W2b `library` kind end-to-end — the 4 validation sync points (test-guarded, adversarially
  verified complete): promote-tool.js:24 z.enum, promote-run.js:10 PROMOTE_KINDS,
  promotions-store.js:15 KINDS, locate() branch (safe — existing callers/tests unaffected;
  board client renders arbitrary kinds, so `library` rows show without client changes). Kind
  name = `library` (no trailing s → the existing `.replace(/s$/)` label sites in session.js:559
  - client promotions.js:23 render it correctly as-is; verify both in impl, no "libraries"
    plural anywhere). Source path: drafts at `<project>/.claude/library/<kind>/<slug>.md` → dst
    `<plugin>/library/<kind>/<slug>.md`. promoteOne library branch: `scanPath(src,
{checkMapping:true})` + `appendIndexLine()` (kind index stays queryable). Extend
    promote-run.test.js with a library fixture (all four enum points + index append + mapping
    block).
- W2a-generalized (adversarial catch C3): the scaffold is GENERATED, not hand-authored — a small
  `ensureDomainLibrary(pluginDir)` (called from materialize/doctor/promoteOne) creates
  `<domain>/plugin/{skills,library}/` + kind indexes on demand for ANY domain (expo/app have the
  same hole). Webapp gets the first generated set for the case study.
- W2c contamination modernization: replace stale `GAME_CODENAMES` with per-project terms —
  caller-supplied (`denylistFor(projectDir)`: PROJECT_DIR basename + package.json name + optional
  `.xenomoon.json` contamination.denylist), passed INTO scanText as args (scanner stays pure/
  testable). **The denylist is the always-on privacy FLOOR** (adversarial catch: the
  business-rules signal degrades to a no-op when a project lacks the heading — so it's the
  bonus layer, not the guarantee; `/onboard` adds the headings to projects missing them). NEW
  deterministic business-rules signal: verbatim lines from the project CLAUDE.md
  `## Business rules`/`## Data model` blocks, opt-in via `opts.businessTerms`. Keep godot signals
  (sync-upstream still needs them). Optional cheap classifier guard: promoteOne warns when a
  source smells spine-shaped — the three-path convention is otherwise prose + the human board
  gate (acknowledged honor-system).

## W3 — `/learn` distiller (M) — needs W1 + W2b

- **FOREGROUND-ONLY (adversarial catch C1):** `allow-project-edits.sh:37-39` deliberately
  excludes `.claude/*` from the sub-agent write grant — a backgrounded `/learn` would have every
  draft write auto-denied. So: `/learn` runs foreground (like the designer — never backgrounded);
  its `.claude/` draft writes go through normal human-gated approval, which IS the design. The
  audit-loop learn arms (which run as sub-agents) do NOT write drafts — they emit draft CONTENT
  in their report; the human materializes via foreground `/learn`.
- **Deterministic cost gate (adversarial catch):** before any LLM pass, check
  `.xenomoon/learn-state.json` — run only when there's a NEW closed-issue delta / qa-divergence
  entry / rejected promotion since last run (token-audit's discipline, applied here).
- CREATE `plugin/commands/learn.md` (CORE, domain-agnostic): triggers (issue closed / PRD
  delivered / UAT / manual); inputs (ANALYSIS verdicts, qa-divergence.md, PRDs, session logs,
  promotions rejects); Step 1 gate → Step 2 distill → Step 3 classify (updates-routing.md) →
  Step 4 land: DOMAIN skill → `<project>/.claude/skills/` + promote kind skills; DOMAIN record →
  `<project>/.claude/library/<kind>/` + promote kind library; PROJECT convention → human-gated
  CLAUDE.md proposal; FRAMEWORK → framework-feedback ledger append. Privacy: every promote passes
  the W2c gate. Bar: "draft only what recurs or bit us."
- **Post-promote UX decision (accepted, documented):** a newly promoted capability needs a NEW
  SESSION (plugin roster loads at session start) — that's cheap and stays; W5 only removes SERVER
  restarts. Stated in updates-routing.md.
- MODIFY the three audit commands: replace dead-end text at the W1 insertion points
  (framework-audit step 4; token-audit.md:138-141 overflow; harvest recurring-pattern step) with
  the report-draft-content → foreground `/learn` arm.

## W4 — Install v2 (L) — needs W4a + W5-cheap-half

- W4a CREATE `ui/server/cli/validate-path.js` (dependency-free): absolute, exists/creatable,
  writable, local disk (reject iCloud `Mobile Documents` + network mounts, soft with
  `--allow-nonlocal`), no framework/project nesting. Wire into setup.js (which stays
  config.js-free) + new.js + UI first-run.
- W4b (adversarial cut: NO new onboarder agent — roster rule, and the designer already owns the
  interview): CREATE `plugin/commands/onboard.md` — a thin `/onboard` command. Deterministic
  parts SCRIPTED (skill inventory, hooks/settings diff report, package.json command detection);
  the judgment parts (annotated CLAUDE.md merge proposal — their content authoritative — and
  the business-rules interview) hand to the EXISTING `designer`. Day-zero harvest = flagged
  skills filed via mcp**ui**promote. Foreground-only (same `.claude/` write-gate reality as
  /learn). MODIFY `ui/server/cli/new.js`: up-front interactive asks (domain, validated path,
  hermes/codex/kimi configure-or-skip via existing setup scripts) — TTY-gated AND
  prompt-only-for-missing-values so test:onboarding stays byte-identical (its fixture passes
  --domain + fresh dir → no prompts, no onboard trigger); check whether onboarding.check
  asserts pack file counts (W2a's generated dirs may need the fixture updated); keep the
  never-overwrite-their-CLAUDE.md guard. Trigger /onboard hint when target has existing
  CLAUDE.md/.claude.
- W4c doctor v2 — MODIFY `ui/server/cli/doctor.js`: wire integrations/{hermes,codex,kimi}-check
  probes (soft rows when enabled), node version vs engines, gh auth (soft), lock validity; fix-hint
  per red row.

## W5 — Restart-tax removal (M) — cheap half independent, do in Wave 1

- Cheap half — MODIFY `ui/server/core/config.js`: ORCHESTRATOR_PROMPT (449) + HERMES/CODEX/
  KIMI_BLOCK (453-463) become per-call getters (getHermesConfig pattern, pure readFileSync);
  update session.js call sites. Orchestrator/block edits then apply per-session, no restart.
  DOMAIN/PROJECT_DIR/env exports stay frozen — documented as the one legit restart (domain/project
  switch).
- Rest — MODIFY `ui/server/core/index.js`: `POST /api/restart` (localhost-only), supervisor-aware
  (adversarial catch C5 — under `npm run start-project`, start-profile.js exits when the server exits,
  orphaning a detached child): start-profile.js sets `XENOMOON_SUPERVISED=1` and RESPAWNS on
  exit code 87 (instead of exiting); /api/restart → supervised: server.close() + exit(87);
  unsupervised (`npm start` direct): server.close(), wait for 'close', spawn detached child of
  same argv, exit(0). MODIFY `ui/server/cli/start-profile.js` accordingly. UI "Apply & restart"
  button in Settings (POST + WS reconnect backoff).

## W6 — Fork/PR flow + CI (M, trimmed per adversarial cut) — needs W2c

- CREATE `plugin/commands/contribute.md` (CORE): stage ONLY `domains/<name>/` learnings on a
  branch (never .xenomoon.json/project facts/.claude local), run `check:agnostic --project
<bound-name>` locally, open PR via gh against arthur0n/xenomoon. CREATE `CONTRIBUTING.md`
  (includes the fork-collision merge convention — see below).
- CREATE `.github/workflows/pr-domain.yml`: fork-PR path-scope gate (changed files ⊆ `domains/**`
  - `docs/**`), contamination scan over the incoming domain diff, check:agnostic.
- MODIFY `package.json` validate: add `check:agnostic` (verify clean local run first). Fix
  onboarding.yml's false "contamination runs" comment. Adversarial catch C4: `contamination.js:6`
  header promises a `cli/gen-contamination.js` validate seam that WAS NEVER BUILT — either build
  the direct-to-plugin scan as part of this step or correct the header; decide in impl (build it:
  a thin CLI that scanPaths `domains/*/plugin/{skills,library}` — it IS the pr-domain scanner).
- **Fork-collision convention (owner-flagged omission):** documented rule in CONTRIBUTING +
  updates-routing.md — on `git pull upstream` conflict inside `domains/**`: local version wins,
  upstream's copy is saved aside as `<name>.upstream/` for a human merge; promoted-capability
  slugs should be descriptive enough to avoid collisions (naming guidance). Tooling for this is
  DEFERRED.
- DEFERRED to v0.6 (when a second fork user exists): CHANGELOG.md, `forge update` wrapper,
  domain.json version bumps.

## W7 — Owner cleanup + case study (S, operational) — acceptance for everything

1. Retire xm-probius: archive Pexelins/xenomoon read-only; remove any lingering local
   remotes/credential pin (this checkout has none — verify); salvage nothing.
2. Bind lexflow from this checkout via W4 flow — its existing CLAUDE.md/.claude exercises the
   onboarder (day-zero harvest of its skills/rules).
3. One real issue end-to-end (designer → analyst → … → commit).
4. `/learn` on it — expect ≥1 webapp library `findings/` record from the Explicação/propagate saga
   - the jsdom lockfile incident.
5. Approve on board → verify landing in `domains/webapp/plugin/` → `/contribute` self-PR
   (dogfood) → pr-domain.yml green.
6. Friend forks + installs via W4 + sees lexflow's learnings day-zero.

## Sequencing

- Wave 1 (parallel, no shared files): W1 · W2a · W5-cheap-half · W4a
- Wave 2: W2b+W2c (same files, together) · W5-rest
- Wave 3: W3 · W4b/W4c
- Wave 4: W6 → W7
- Milestones: v0.2 = W1+W2+W5-cheap (routing doc, library loop — MANUAL promote loop only,
  human-authored drafts; /learn auto-drafting is v0.3 — live orchestrator edits) ·
  v0.3 = W3+W5-rest (learning + restart-free) · v0.4 = W4 (friend-install works) ·
  v0.5 = W6+W7 (contribute + dogfood proof) · v0.6 (deferred: CHANGELOG, forge update,
  domain versioning — when a second fork user exists).

## Cross-cutting risks

1. Four-point promotion enum sync — test fixture guards all four.
2. check:agnostic into validate/CI can red on strays — run locally across domains/plugin/ui first.
3. TTY-gate all new prompts — test:onboarding must stay byte-identical.
4. contamination.js purity — project-denylist read lives in the CALLER, terms passed as args.
5. /api/restart port rebind — wait for server 'close' before spawning the child.

## Verification (per milestone)

- v0.2: npm test (new library fixture green), npm run doctor counts webapp skills/library, promote
  a fixture record end-to-end via board + CLI, edit orchestrator.md → new session sees it live.
- v0.3: /learn on a closed issue → drafts on board → approved → files in domains/webapp/plugin/;
  Apply & restart button round-trips (WS reconnects).
- v0.4: test:onboarding green (non-interactive path unchanged); manual install onto a lexflow
  copy runs the onboarder proposals; doctor v2 rows render with fix-hints.
- v0.5: self-PR from a domain learning passes pr-domain.yml (scope + contamination + agnostic);
  validate includes check:agnostic and is green.

Critical files: promote-run.js · contamination.js · config.js · new.js · index.js (server core) ·
promote-tool.js · promotions-store.js · doctor.js · library-record-writing SKILL.md ·
onboarding.yml · check-spine-agnostic.sh.

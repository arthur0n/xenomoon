# {{PROJECT_NAME}} — project facts

> Policy/routing lives in the domain orchestrator.md; this file is project FACTS only.
> Fill in every `{{…}}` placeholder; delete any section that genuinely doesn't apply.
> The webapp domain's agents and orchestrator read this file and treat it as
> authoritative — it overrides their generic defaults.

## Project overview

{{what it is — one or two sentences: who uses it, what it does}}

## Stack

- **Frontend:** {{framework + build tool, e.g. React + Vite, Next.js}} · {{styling}} · {{routing}}
- **Backend:** {{runtime + API layer, e.g. Node + tRPC on Lambda, Express, Fastify}}
- **Database:** {{db + ORM/migration tool, e.g. PostgreSQL + Drizzle, Prisma}}
- **Auth:** {{auth provider + where the adapter lives, e.g. Clerk in src/auth/**}}
- **Shared code:** {{where cross-cutting types + business rules live}}

## Data model / tenancy

- **Tenancy model:** {{single-user B2C | multi-tenant | per-org — and how isolation works}}
- **Scoping rule:** {{how user/tenant-owned data is scoped — the helper/layer that enforces it,
  e.g. every user-owned query goes through the scoped-DB helper; a new table needs a scope entry}}
- **Key entities:** {{the main tables/collections and their relationships, briefly}}

## Commands

- **Install:** {{e.g. pnpm install}}
- **Dev:** {{e.g. pnpm dev (api) / pnpm dev:app (frontend)}}
- **Build:** {{e.g. pnpm build}}
- **Validate:** {{type-check + lint + unit tests, e.g. pnpm validate}}
- **Test:** {{unit runner, e.g. pnpm test (vitest)}}
- **Smoke / integration:** {{e.g. pnpm smoke — real-DB end-to-end check; the domain `smoke` key}}
- **E2E / UAT:** {{e.g. pnpm e2e — capped Playwright acceptance; the domain `e2e` key. Run via /uat,
  never an ad-hoc unbounded playwright test. Assumes the app is already running.}}
- **Clerk auth setup (one-time, manual):** {{e.g. pnpm auth:setup — a human signs in once through the
  real Clerk form and saves the session to a gitignored .auth/clerk-user.json for the e2e suite to
  reuse. Rotation = re-run it. Never automate the Clerk form.}}
- **Migrate:** {{generate → review → apply, e.g. pnpm db:generate → review SQL → pnpm db:migrate}}

## Conventions / convention floor

Project-specific hard rules every change must respect (the agents obey these over their defaults):

- {{e.g. business rules live in shared/domain/ — not in routers or components}}
- {{e.g. store stable English codes, render display labels via the LOV system — never hardcode a label literal}}
- {{e.g. auth (`@clerk/*`) only in the auth adapter}}
- {{e.g. no console.log / no `any` / no non-null `!`; lint runs with zero warnings}}
- {{e.g. algorithms are config-driven — no magic numbers}}
- **Every fix carries a regression test** — a hermetic **unit** test for isolatable logic, a
  **smoke / integration** test for data-API paths (scoping, transactions). `/qa` blocks (`qa:blocked`)
  any fix without a test that actually guards the bug; a green build alone is not a pass.
- **Acceptance (UAT) is resource-capped, never unbounded** — the capped Playwright config below is
  the only way it runs (headless, one worker, chromium-only, no retries, strict timeouts). Never a
  raw `playwright test`.
- {{add the rules that are actually non-negotiable here}}

## Business rules / product facts

Standing facts about **what this product does / doesn't do** — captured product INTENT, in
the user's own words. **Designer-maintained, human-gated** (the `designer` agent proposes
additions during `/design` and writes them only after you approve). The agents treat this
block as **AUTHORITATIVE intent**: the analyst never manufactures a hypothesis that
contradicts a rule here (a symptom-vs-intent conflict is a designer question, not a code
trace); the developer builds to it; the tester reads it as rubric. Empty until the first
`/design` seeds it — quote the fact, don't paraphrase it.

- {{e.g. "We're not using the Explicação columns — propagate the value instead."}}
- {{add each standing product rule verbatim as it's captured}}

## Acceptance testing (UAT)

Capped Playwright acceptance, run via `/uat` against an **already-running** app (the runner never
boots servers — give it the base URL). **POC-first:** the default `poc` scenario loads the app with
the saved session, asserts a known post-login element, and confirms one user-scoped read path renders
non-empty. Nothing larger until that proves stable.

**Resource caps (mandatory — past unbounded runs killed the machine).** The Playwright config must
encode:

```
headless: true, workers: 1, fullyParallel: false, projects: [chromium], retries: 0
timeouts: test ~30s / expect ~5s / action ~10s / navigation ~15s + a global run cap
trace: off, video: off, screenshot: 'only-on-failure'
explicit context/browser teardown after each run
```

**Clerk auth via saved `storageState` (never automate the form).**

1. One-time **manual** human sign-in through the real Clerk form saves the session to a **gitignored**
   `.auth/clerk-user.json` (add it to `.gitignore`).
2. The config's `use.storageState` points at that file so runs reuse the session.
3. Rotation = re-run the manual sign-in. An auth failure (bounced to sign-in) means the stored state
   is stale — re-run the manual step. **Never** script the Clerk login form or store credentials.

UAT is **out-of-band** of the per-issue pipeline — it applies no `qa:*` / `review:*` labels and gates
no commit. A UAT failure files a new `/feedback` bug.

## Infrastructure

- **Deploy targets:** {{frontend target + backend target, e.g. CF Pages for app, AWS Lambda for api}}
- **CI workflows:** {{the deploy workflows + their trigger, e.g. deploy-app.yml / deploy-api.yml on push to main, paths-filtered}}
- **Deploy is CI-only** — never `sam deploy` / `wrangler deploy` / manual. {{note the shared account / OIDC role if relevant}}
- **Recommended CI qa-gate job** (fail-closed, project-side): before a deploy, grep the head commit
  message for issue refs `(#N)`; for each referenced issue, require `qa:pass` **and** `review:pass`
  and the **absence** of `qa:blocked` / `review:changes`. Fail the deploy if any referenced issue
  misses the gate or if the labels can't be read (fail-closed — a missing signal blocks, never ships).
  This makes the pipeline's commit gate enforceable at the deploy boundary, not just advisory.
- **Environments / env vars:** {{where env/secrets live per environment — dashboard, .env, secrets manager}}
- **gh account:** {{the specific gh account to use, if this project needs one — otherwise "use the active account"}}

## NEVER (project-specific)

- Never deploy manually — push to the main branch and let CI ship it.
- Never apply DB migrations by hand — generate, review the SQL, then run the migrate command.
- Never commit secrets / env values.
- Never bypass the data-scoping layer for user-owned data (no cross-user/tenant leaks).
- {{e.g. never hardcode a display-label literal — use the project's label/enum system}}
- {{add any other hard "never" specific to this project}}

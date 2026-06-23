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
- **Smoke / integration:** {{e.g. pnpm smoke — real-DB end-to-end check, if any}}
- **Migrate:** {{generate → review → apply, e.g. pnpm db:generate → review SQL → pnpm db:migrate}}

## Conventions / convention floor

Project-specific hard rules every change must respect (the agents obey these over their defaults):

- {{e.g. business rules live in shared/domain/ — not in routers or components}}
- {{e.g. store stable English codes, render display labels via the LOV system — never hardcode a label literal}}
- {{e.g. auth (`@clerk/*`) only in the auth adapter}}
- {{e.g. no console.log / no `any` / no non-null `!`; lint runs with zero warnings}}
- {{e.g. algorithms are config-driven — no magic numbers}}
- {{add the rules that are actually non-negotiable here}}

## Infrastructure

- **Deploy targets:** {{frontend target + backend target, e.g. CF Pages for app, AWS Lambda for api}}
- **CI workflows:** {{the deploy workflows + their trigger, e.g. deploy-app.yml / deploy-api.yml on push to main, paths-filtered}}
- **Deploy is CI-only** — never `sam deploy` / `wrangler deploy` / manual. {{note the shared account / OIDC role if relevant}}
- **Environments / env vars:** {{where env/secrets live per environment — dashboard, .env, secrets manager}}
- **gh account:** {{the specific gh account to use, if this project needs one — otherwise "use the active account"}}

## NEVER (project-specific)

- Never deploy manually — push to the main branch and let CI ship it.
- Never apply DB migrations by hand — generate, review the SQL, then run the migrate command.
- Never commit secrets / env values.
- Never bypass the data-scoping layer for user-owned data (no cross-user/tenant leaks).
- {{e.g. never hardcode a display-label literal — use the project's label/enum system}}
- {{add any other hard "never" specific to this project}}

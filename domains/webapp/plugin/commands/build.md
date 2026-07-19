---
description: Build/verify this webapp — local production build + smoke (default), or watch the CI deploy
argument-hint: "[ local | smoke | deploy ]"
allowed-tools: Bash
---

Build & verify this webapp project. Default = **local production build** (the test
build). This project **never deploys from a laptop** — production ships via **CI on
push to the main branch** (see `CLAUDE.md` → Infrastructure for the exact workflows /
targets). This command runs the local build/smoke and, for `deploy`, helps you watch
the CI run. It must **never** run `sam deploy`, `wrangler deploy`, or any manual deploy.

Use the project's own commands (from the domain manifest's `build` / `lint` / `test` /
`smoke` / `e2e` and `CLAUDE.md` → Commands — e.g. `npm run build` / `npm run validate` /
`npm run smoke` / `npm run e2e`, or whatever the project uses: pnpm/yarn/etc.).

Arguments: `$ARGUMENTS`

## Routing

- **(empty)** or **`local`** → the project's **build** command.
  The production build (e.g. into `dist/`). Plus the project's **validate** command if
  not already green this session. This is the default for verifying a change builds clean
  locally. For quick iteration the dev servers are enough (the project's dev / dev:app
  scripts) — no rebuild needed.

- **`smoke`** → the project's **`smoke`** command (the domain manifest's `smoke` key,
  `npm run smoke --if-present`). End-to-end check of the data API against the real DB
  (throwaway/self-cleaning where the project supports it). Use after a backend/DB change
  to confirm the live data path works. Acceptance UAT is separate — the project's **`e2e`**
  key (`npm run e2e --if-present`) is the capped Playwright suite, run via `/uat`, not
  here.

- **`deploy`** → **do NOT deploy from here.** Confirm with me first, then:
  1. Remind me deploy happens by pushing to the main branch (CI does the cloud work;
     manual deploy is forbidden — shared cloud account / OIDC role).
  2. After a push, watch the run:
     `gh run list -R {{REPO}} --branch <main-branch> --limit 5` and
     `gh run watch -R {{REPO}} <run-id>`.
     (Resolve `{{REPO}}` with `gh repo view --json nameWithOwner -q .nameWithOwner` if it
     wasn't substituted.)
  3. Report pass/fail of each deploy workflow. A failed run made no cloud change unless
     it passed the credentials step — say which step failed.

## Notes

- The build + smoke + e2e commands are local and safe. **`deploy` is outward-facing and
  CI-only** — never `sam deploy`/manual; always confirm before pushing the main branch.
- **Post-commit flow:** the pipeline auto-commits once an issue is green (`/qa` + `/audit`
  pass → `/commit`). `/build` is where you verify the build locally; then **you push** the
  main branch (the human gate) and CI ships it. Commit is automatic; **push is the human
  gate** — the `committer` never pushes.
- Migrations are separate: produce them with the project's migrate-generate command →
  review the SQL → run the migrate command (never hand-apply SQL, never a destructive
  auto-push).

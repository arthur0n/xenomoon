---
name: domain-conventions
agents: [developer]
domain: webapp
description: The webapp stack's non-negotiables — auth stays in one adapter, user-owned data goes through the scoping layer, migrations are generated and reviewed, secrets never land in code, and the frontend/backend type split is real. Load before writing code in a React + Node project; the project's own CLAUDE.md overrides anything here.
---

# Webapp conventions — the floor under every change

Generic orientation for a React + Node stack. **The project's `CLAUDE.md` is authoritative** — where
it disagrees, it wins, and where it is silent these are the defaults that keep a webapp out of
trouble.

## Read before writing

- **`CLAUDE.md`** — stack, data model and tenancy, the command list, the convention floor, the
  project's NEVER list.
- **`docs/conventions.md`** when present — the hard rules and refactor playbooks.
- **The project's lint config.** Write code that passes it first time: assume strict (zero warnings,
  no `any`, no non-null `!`, type-aware rules) unless the project says otherwise. Touching a
  lint-quarantined file means hardening it back to the bar, not inheriting its exemption.
- **The right tsconfig.** Most projects split frontend and backend; importing a backend-only type
  into a frontend file type-checks locally and breaks the build.

## The five that cause real damage

1. **Auth lives in ONE adapter.** Session/token logic scattered across routes is how an auth
   boundary quietly stops holding. If your change needs auth behaviour somewhere new, that is a
   design question, not a copy-paste.
2. **User-owned data goes through the scoping layer.** Every query for per-user or per-tenant data
   uses the project's scoping helper; a new table needs its scope entry in the same change. A
   missing scope entry is a cross-user leak waiting for its first multi-user day.
3. **Migrations are generated, READ, and committed together.** Produce with the project's migrate
   tool, read the SQL it wrote (it will happily drop a column), commit it alongside the code. Never
   hand-apply SQL, never auto-push a destructive migration.
4. **Secrets come from the project's env mechanism.** Never a literal, never a "temporary" fallback
   value — those outlive the sprint and end up in a public bundle.
5. **Use the project's label/enum system.** Store stable codes, render display labels through it. A
   hardcoded literal that dodges the system is a bug that only shows up in the other locale, the
   other tenant, or the other environment.

## Errors and input

Validate at the boundary with the project's schema layer; do not let raw input reach the database
or a template. Do not swallow errors to make a path "work" — a caught-and-ignored error becomes a
500 nobody can trace, or worse, a silent wrong answer.

## When the change touches auth, scoping, or an access tier

Say so at the top of your report. Those carry a higher review bar by policy, and the reviewer needs
to know before reading the diff, not after.

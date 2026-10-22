# Name denylist — the public-safety gate

The repo is public. Client, customer and project names must never reach it. The project-name
registry (`~/.xenomoon/installs.json`) only knows projects that have an install, so names
without one live in a **local denylist** that stays outside the repo. Never commit a real list.

## Where the terms come from

All sources merge (loader: `ui/server/cli/denylist.js`):

| Source                           | Used by          | Notes                                          |
| -------------------------------- | ---------------- | ---------------------------------------------- |
| `~/.xenomoon/denylist.txt`       | local checks     | default file; missing is fine                  |
| `$XENOMOON_DENYLIST`             | local checks     | path override; a missing file is an error      |
| `$XENOMOON_DENYLIST_TERMS`       | CI (repo secret) | newline- or comma-separated list               |
| install registry + bound project | local checks     | unchanged (`known-projects.js`, `denylistFor`) |

## Format

```text
# one term per line; '#' starts a comment; blank lines are ignored
acme-fake
globex-fake   # a trailing comment is fine
initech-fake, umbrella-fake   # commas also split
```

Matching is whole-word and case-insensitive: `acme-fake` matches `ACME-FAKE` and
`acme-fake.md`, not `acme-faker`.

## Where it is enforced

| Gate             | Command                                                      | Scans                                    |
| ---------------- | ------------------------------------------------------------ | ---------------------------------------- |
| validate         | `npm run check:contamination`, `npm run check:project-names` | capability trees; tracked source         |
| pre-commit       | `check-project-names.js --staged` (+ gitleaks, now required) | added lines and paths of staged changes  |
| pre-push         | `check-project-names.js --push` (reads the hook's stdin)     | added lines of every commit being pushed |
| CI (`pr-domain`) | both checks with `--require-terms`                           | an empty term list FAILS                 |

`--require-terms` exists for CI: a gate with no names to look for passes by seeing nothing, so in
CI an empty list (secret missing) is a failure. The secret `XENOMOON_DENYLIST_TERMS` is set by
the repo owner; workflows from forks do not receive secrets, so a fork PR fails this gate until a
maintainer runs it.

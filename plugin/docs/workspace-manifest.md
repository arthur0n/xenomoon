# Workspace manifest

A bound project folder can be a plain **parent folder** that holds several git repos (one
"workspace"), instead of one repo. The parent says so with a local file:

```
<parent>/.xenomoon/workspace.json
```

It belongs to the bound folder. It is never shipped in a domain pack and never written inside the
framework repo.

## Format

```json
{
  "version": 1,
  "repos": [
    {
      "name": "acme-api",
      "path": "acme-api",
      "remote": "git@github.com:acme-co/acme-api.git"
    },
    {
      "name": "acme-web",
      "path": "apps/acme-web",
      "remote": "git@github.com:acme-co/acme-web.git",
      "upstream": "git@github.com:acme-tmpl/acme-web.git",
      "mirror": "git@git.example.com:acme-co/acme-web.git"
    }
  ]
}
```

| Field      | Required | Meaning                                                                   |
| ---------- | -------- | ------------------------------------------------------------------------- |
| `version`  | yes      | Always `1`.                                                               |
| `name`     | yes      | Short id, unique. Letters, digits, `.`, `_`, `-`.                         |
| `path`     | yes      | Folder of the repo, relative to the parent. No `..`, no nesting of repos. |
| `remote`   | yes      | The repo's `origin` URL. For GitHub, issues and PRs target this repo.     |
| `upstream` | no       | The repo it was derived from (fetched as the `upstream` remote).          |
| `mirror`   | no       | A second push target, if the repo is mirrored elsewhere.                  |

A manifest that is present but broken (bad JSON, missing field, duplicate name, a path outside the
parent) is an error, not "no workspace": every reader stops and names the problem.

## What reads it

- `ui/lib/workspace.js` — `loadWorkspace(root)` and `findWorkspace(start)` (walks up to the nearest
  parent holding the file).
- `repoFor(ws, path)` (same file) — which child repo a path belongs to; `null` for the parent.
- issuekit picks the child repo's GitHub repo from `remote` when run inside a child, instead of a
  `.issuekit.json` sitting at the parent; at the parent itself it stops and asks for a child or
  `--repo`. A child without its own `.xenomoon/branch-model` reads the parent's.
- The installer (`new`) reads default branches and deploy workflows from the children, and prints
  every guess. Pulse marks its sweep degraded (children's PRs/issues are not swept yet); the epic
  tool says its store is local. The commit-label hook resolves `cd <child> && git commit`, or says
  the labels were not stamped; the issue-dedup hook ignores a parent `.issuekit.json`.

## Preparing a new workspace

```
node ui/server/cli/workspace-prepare.js --manifest <workspace.json> \
  --target <new parent> --base git@github.com:acme-client [--apply]
```

Dry-run by default (prints the plan). With `--apply`, each repo is cloned from its `remote` into
`<target>/<path>`; that source stays as the `upstream` remote, and `origin` becomes
`<base>/<name>.git`. Nothing is pushed: creating the repos under the new base is a separate step.
The new `<target>/.xenomoon/workspace.json` lists the new origins (`mirror` is not carried over).
It refuses, before changing anything, a target inside the framework repo, a repo folder that
already exists, or a target that already has a manifest.

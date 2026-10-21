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

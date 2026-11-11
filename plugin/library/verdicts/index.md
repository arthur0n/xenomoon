# verdicts — index

One line per record, sorted by filename: `- [<title>](<slug>.md) — <description>`

- [hub-is-the-only-entry-point](hub-is-the-only-entry-point.md) — The hub is the only way to open a project session; nobody starts or opens a single project server directly.
- [hub-owns-the-process-lifecycle](hub-owns-the-process-lifecycle.md) — A client's server starts only on an explicit hub action, detached through the install's own `start_server` with the row's port; stop is explicit too; closing the hub leaves every client's server running; orphan servers are shown, not adopted.
- [hub-reads-the-registry-and-writes-nothing](hub-reads-the-registry-and-writes-nothing.md) — The hub's rows come from `~/.xenomoon/installs.json` plus each install's saved profiles; the hub writes no project or registry state and commits nothing; its only writes are its own diagnostics under `~/.xenomoon/hub/`.
- [one-install-per-domain-projects-as-profiles](one-install-per-domain-projects-as-profiles.md) — One framework install per domain; a project is a profile of that install, never a clone of its own.
- [one-process-per-project](one-process-per-project.md) — Each project runs as its own server process behind the hub; the hub never hosts a project session in-process.
- [project-state-lives-in-the-project](project-state-lives-in-the-project.md) — Everything written for one project, session logs included, lives under `<project>/.xenomoon/`; the install holds only domain-level state. _(draft)_
- [project-tab-is-an-iframe-with-status](project-tab-is-an-iframe-with-status.md) — A hub tab is the project's own UI in an iframe on the project's port, kept alive when hidden; its status dot comes from `GET /api/status` polled, pushed early by `postMessage`. _(draft)_

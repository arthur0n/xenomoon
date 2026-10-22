---
name: stack-conventions
agents: [researcher, developer]
domain: coghatch
description: The floor for knowledge work across a multi-repo stack — a standing record is the answer, one rule lives in one record and is referenced by slug, technology is a `tags` value, and nothing names a client. Load before writing or changing a decision, convention, guideline or shareable doc; the workspace CLAUDE.md overrides anything here.
---

# Stack conventions — the floor under every record and doc

**The workspace `CLAUDE.md` is authoritative** — where it disagrees, it wins.

- **Search first.** Run the `library-record-search` skill before proposing anything. If a record
  stands, apply it and cite its slug; do not re-decide it.
- **One rule, one record.** Write it with the `library-record-create` skill; change it with the
  `library-record-revise` skill. A doc that needs the rule links the slug and does not copy it.
- **Tech is a tag.** `tags: [node, postgres]` — not a folder, not a filename prefix.
- **Shareable means scrubbed.** No client, company or private project names; use `acme-*`
  placeholders. No credentials, hostnames or internal URLs.
- **No ledgers.** No change logs or decision tables beside the records; git holds the history.

## Standing conventions (one record each — cite the slug, never restate)

- Process: `verdicts/no-workaround-without-approval`, `verdicts/decisions-reopened-on-evidence`,
  `verdicts/third-party-plans-not-authority`, `verdicts/questions-answered-not-acted-on`,
  `verdicts/working-rhythm`, `verdicts/issue-format`.
- Evidence: `verdicts/no-invented-numbers`, `verdicts/verify-against-source-not-memory`,
  `verdicts/documents-timeless-evidence-on-issue`.
- Git: `verdicts/commit-message-format`, `verdicts/branches-and-pull-requests`.
- Dependencies: `verdicts/exact-version-pins`, `verdicts/dependency-boundary`.
- Testing: `verdicts/test-layout`.
- Infra and security: `verdicts/infra-mutation-one-approved-command`, `verdicts/cloud-resource-labels`,
  `verdicts/secrets-handling`, `verdicts/identity-key-is-object-id`,
  `verdicts/adversarial-review-security-diffs`.
- Agents and MCP: `verdicts/mcp-tool-contracts`.

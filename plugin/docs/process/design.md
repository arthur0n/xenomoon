# Design docs

Each file here is one small, agreed slice of work — a one-page PRD — produced by **the `product-owner` agent** (Opus, interview-first). A doc must be implementable by the active domain's builder in one task and verifiable by the domain's checks with one human look.

Workflow: idea → **product-owner** (interviews the user, captures business rules verbatim, cuts scope, writes the doc) → builder (implements) → verify (checks) → human look. The orchestrator routes; it does not author the doc — the product-owner does.

The product-owner also **captures durable business rules**: standing product facts surfaced in the interview ("we don't use Y, do Z") are proposed — human-gated — into the project's `.claude/library/business-rules.md` (with a one-line pointer in the `CLAUDE.md` index), so they outlive one session and the downstream agents (analyst, developer, tester) treat them as authoritative intent. The PRD holds the slice's rules; the library doc holds the project's — `CLAUDE.md` itself stays an index, never the content sink.

No code is designed or written here beyond the agreed slice — parked ideas live in each doc's "Later" section.

**Lifecycle: these docs are temporary.** A design doc lives only while its work is in flight. After the slice lands, the orchestrator graduates it (separate, foreground, human-gated): durable facts → `.claude/library/` + index line, the doc → `design/archive/<slug>.md` (never deleted — issues link their PRDs), new path commented on the issue.

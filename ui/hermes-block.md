## Hermes · Research coworker

Hermes is your external research coworker: a separate agent with its own model, web search, and a private brain (`~/.hermes` — skills + memory it grows across runs). It investigates; it never edits the project or framework.

### Dispatch

For capability/tooling/knowledge-gap _investigation_, call `mcp__ui__hermes` with a focused `task` + `context` (and a `persona`: `researcher` by default, or `critic` to adversarially stress-test a claim/plan/findings) — only you (the Hive) and the `debrief` agent may call it; other sub-agents never do.

It is **fire-and-forget**: the call returns immediately; Hermes works in the background, streams progress to the feed, and later delivers its findings as a **new message** (tagged `[Hermes … delivered its findings]`). Do NOT wait on it — finish or wrap up the turn.

**An ack is not a result.** "Run started" only means the request was accepted — report it as _dispatched, unverified_, never as working. The run's real outcome arrives later as a findings message or a failure message. After ANY Hermes failure, Hermes is **suspect**: do not re-dispatch until the cause is confirmed fixed, and never repeat the identical un-verified pattern. **The native-researcher fallback exists ONLY for Hermes OFF/not-configured** — a failure of an ENABLED Hermes is a broken tool or a dead run: read the error (it is usually diagnosable — a port, a model, a config key), surface it to the human with the likely fix, re-dispatch tightened when appropriate. Every failure is auto-appended to `.xenomoon/debrief-queue.md`.

When that findings message arrives, treat it as its OWN lead — not a footnote to whatever was already in flight: the server has **already filed a board task** for it the moment it landed, so surface it to the user promptly and let them READ the findings before you put any decision in front of them. Hand it to the `researcher` (with the matching `research-*` mode named) to own the human verdict + the library write — and for the route/adopt decision prefer the async board (`mcp__ui__ask`) over a blocking `AskUserQuestion`/`mcp__ui__form`, since a modal can surface **before** the long findings render, leaving it unanswerable in isolation. If it reports Hermes is off/not-configured (or errors), dispatch the researcher directly instead. Each Hermes call is gated (allow/deny).

**Ground before you dispatch.** For any benchmark / audit / improve-what-we-HAVE task, Hermes and the `researcher` cannot read this repo — so FIRST establish the actual current implementation yourself (cite real files: which systems exist, the render path, etc.) and pass it in `context`. Never let a researcher infer our design from genre assumptions or from possibly-stale project docs; an ungrounded benchmark invents gaps that don't exist. Same rule when dispatching the `researcher` directly.

### Make Hermes compound (self-improvement is why it's worth the cost)

Hermes' `memory` + `skills` toolsets are its own brain — but they only compound if dispatches are shaped for it (its skill retrieval is LITERAL description-matching at run start; no semantic search):

- **Hermes-first for external knowledge.** Any capability / library / tooling / "how does the ecosystem do X" gap → `mcp__ui__hermes` before a native researcher spends on it. Repo-internal questions stay native — Hermes cannot read this repo.
- **Frame by durable SUBDOMAIN, never by incident.** "Supabase RLS for multi-tenant reads", "Expo Router deep-linking patterns" — not "why issue #412 fails". Hermes files its own skill under the framing you gave it; incident-shaped framing produces a skill that can never match a future task.
- **Reuse the same vocabulary across runs.** Hermes re-selects a saved skill by literally reading its one-line description against the new task. Drifting nouns ("RN" vs "React Native") makes a good skill go unread.
- **Its brain lags by one run.** Memory renders into its prompt at run start; anything learned in run N only changes behavior from run N+1. Don't expect a same-run fix.
- **Its brain is tiny and per-domain** (~2,200 chars of agent memory in this DOMAIN's profile, shared across every project of this domain). Never ask it to memorize project trivia — that belongs in our library. Only durable stack facts that serve the whole domain.
- **Hermes never touches this project.** It investigates and reports; adoption is the researcher → `library/` → human verdict → promote path. Each dispatch is gated.

### Feedback

After the `researcher` has reviewed the findings and written the verdict to `library/verdicts/`, call `mcp__ui__hermes_feedback` with:

- `runId` — the run id from the findings message header (`run <id>`)
- `verdict` — one of: `"useful"` (cited, actionable, novel); `"partial"` (some findings helped, others were stale/off-topic); `"not-useful"` (off-topic, uncited, or no value found)
- `notes` — 1–3 lines on what was good, missing, or wrong

This fires a short self-update run so Hermes can record the lesson in its own memory and skills. It is non-blocking (fire-and-forget, no findings delivered back). Call it once per delivery — even for "not-useful" runs, so Hermes learns what to avoid.

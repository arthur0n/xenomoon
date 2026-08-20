## Codex · Code reviewer

Codex is an on-demand OpenAI code-review model, active this session (Settings → Agents → Codex).
It **reviews** code — it never edits, stages, or commits. {{CODEX_COST_DOCTRINE}} You reach it
through the `mcp__ui__codex` tool; `/codex:review` + `/codex:adversarial-review` (user-typed) and
the `codex:codex-rescue` subagent (fix-it tasks) are the human's own paths to the same CLI.

### Reviews go through `mcp__ui__codex` — never your own Bash

You never run a review yourself and never read raw review output. Call the tool; it runs the CLI,
distils the result deterministically, and returns a receipt plus the path to the full review on
disk. You are a router, not an aggregator.

**A receipt comes back in one of three shapes — read which one you got:**

- **`verdict: … · N finding(s)`** — an adversarial pass. Schema-checked structure, one line per
  finding. Complete; act on it.
- **A short native review** — the whole thing, because it was short enough that distilling it would
  only lose detail. Complete; act on it.
- **`PARTIAL — Codex wrote N chars; this is its structure only:`** — a long native review, reduced
  to its headings and finding leads. **NOT complete.** Never gate a commit on a partial receipt as
  if it were the verdict. Either `Read` the named file for the ONE section a finding needs, or —
  when you need the whole review digested — dispatch `xenomoon:handoff-summarizer` on that path
  (haiku, ≤5 lines: verdict / blocking / minor / open). Do not read the full review into your own
  context, and do not put a bigger model on it: a long review is a summarizing job, not a
  reasoning one.

```js
// Standard working-tree review:
mcp__ui__codex({ kind: "review" });
// Against a base branch / fixed scope:
mcp__ui__codex({ kind: "review", base: "main", scope: "branch" });
// Adversarial pass (challenges the approach; returns structured findings):
mcp__ui__codex({ kind: "adversarial-review", focus: "the save/load path" });
```

The call **blocks** until the review finishes — a review is a quality GATE, so its verdict lands in
the turn that asked for it. Expect minutes; progress streams to the feed meanwhile. There is no
Claude model in this path: Codex does the reviewing, the tool does the formatting.

**Consent is mechanical, not conversational.** Every `mcp__ui__codex` call raises ONE harness
permission prompt — that prompt IS the user's consent. Do not offer a review in chat first, do not
ask twice, do not route around the prompt. Call it when a quality gate warrants it; the human
approves or denies at the prompt. One review round per slice is the default — further rounds need
the human's go. Relay the receipt faithfully (verdict / findings / next steps), briefly.

For an arbitrary Codex turn (a quick question or a write task) the companion CLI is still the path,
and it self-detaches with `--background`, giving a job id you can poll:

```bash
node "{{CODEX_COMPANION}}" task --background --write --model gpt-5.5 "PROMPT"   # returns a job id
node "{{CODEX_COMPANION}}" status --all --json                                  # poll
node "{{CODEX_COMPANION}}" result <job-id> --json                              # read
node "{{CODEX_COMPANION}}" cancel <job-id>                                     # stop, if needed
```

For a targeted **fix-it** pass over Codex's findings, delegate to the `codex:codex-rescue`
subagent via the Task tool (it's scoped to that job). The user can still type `/codex:review`
themselves — that path goes through the Bash consent hook instead of the tool's prompt.

### When to use

- After the active domain's builder lands a significant feature or refactor and a second pair of eyes helps.
- When the user explicitly asks for a code review, a security check, or a quality audit.
- Before a project-local skill/agent is promoted to the framework — catch issues before they're permanent.

### Limits

- Read-only and advisory: Codex never writes files, stages commits, or runs the build (a `task --write` can edit, but that's the rescue/fix path, not a review).
- Findings surface as inline comments in the UI; you and the active domain's builder decide what to act on.
- Keep Codex for non-trivial reviews — trivial single-function tweaks don't warrant the cost/time.
- A review that exceeds 20 minutes is killed and reported as a broken tool, not as a clean verdict.
- If the `codex` CLI isn't installed/authed, the tool returns the error rather than a review (install: `npm i -g @openai/codex`, then `codex login`). That's an install/auth gate, not an interactive one.

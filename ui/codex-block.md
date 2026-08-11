## Codex · Code reviewer

Codex is an on-demand OpenAI code-review model, loaded as an optional second plugin and active
this session (Settings → Codex). It **reviews** code — it never edits, stages, or commits.
{{CODEX_COST_DOCTRINE}} Surfaces as the `xenomoon:codex-review` subagent (your review path),
`/codex:review` + `/codex:adversarial-review` (user-typed), and the `codex:codex-rescue`
subagent (fix-it tasks).

### Reviews go through the `codex-review` subagent — never your own Bash

You never run a review yourself and never read raw review output. Dispatch the
`xenomoon:codex-review` subagent with the companion path and the review args; it runs the CLI,
parses the structured result, and returns a tight receipt (verdict + findings + next steps).
The full review never enters your context — you are a router, not an aggregator.

```js
// Standard working-tree review:
Task({
  subagent_type: "xenomoon:codex-review",
  prompt: `Companion: {{CODEX_COMPANION}}\nRun: review`,
});
// Against a base branch / fixed scope:
Task({
  subagent_type: "xenomoon:codex-review",
  prompt: `Companion: {{CODEX_COMPANION}}\nRun: review --base main --scope branch`,
});
// Adversarial pass (challenges the approach; takes focus text):
Task({
  subagent_type: "xenomoon:codex-review",
  prompt: `Companion: {{CODEX_COMPANION}}\nRun: adversarial-review "focus on the save/load path"`,
});
```

**Consent is mechanical, not conversational.** A PreToolUse hook gates every review invocation
of the companion behind ONE harness permission prompt — that prompt IS the user's consent. Do
not offer a review in chat first, do not ask twice, do not route around the prompt. Dispatch
when a quality gate warrants it; the human approves or denies at the prompt. One review round
per slice is the default — further rounds need the human's go. Relay the subagent's receipt
faithfully (verdict / findings / next steps), briefly.

For an arbitrary Codex turn (e.g. a quick question or a write task), use `task`, which DOES
self-detach with `--background` and gives a job id you can poll:

```bash
node "{{CODEX_COMPANION}}" task --background --write --model gpt-5.5 "PROMPT"   # returns a job id
node "{{CODEX_COMPANION}}" status --all --json                                  # poll
node "{{CODEX_COMPANION}}" result <job-id> --json                              # read
node "{{CODEX_COMPANION}}" cancel <job-id>                                     # stop, if needed
```

For a targeted **fix-it** pass over Codex's findings, delegate to the `codex:codex-rescue`
subagent via the Task tool (it's scoped to that job). The user can still type `/codex:review`
themselves — that path goes through the same consent prompt.

### When to use

- After the active domain's builder lands a significant feature or refactor and a second pair of eyes helps.
- When the user explicitly asks for a code review, a security check, or a quality audit.
- Before a project-local skill/agent is promoted to the framework — catch issues before they're permanent.

### Limits

- Read-only and advisory: Codex never writes files, stages commits, or runs the build (a `task --write` can edit, but that's the rescue/fix path, not a review).
- Findings surface as inline comments in the UI; you and the active domain's builder decide what to act on.
- Keep Codex for non-trivial reviews — trivial single-function tweaks don't warrant the cost/time.
- If the `codex` CLI isn't installed/authed, the companion errors out (install: `npm i -g @openai/codex`, then `codex login`). That's an install/auth gate, not an interactive one.

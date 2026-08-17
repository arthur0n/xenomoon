# Hermes — the optional external researcher

Hermes is an **optional** external agent the **Hive** can delegate deep research to. It is
**off by default** — the framework runs fully without it. Turn it on only if you want to test
whether its web-search + memory + skills produce better capability/tooling research than the
built-in Xenomoon researchers.

> **The one thing that trips everyone up:** Hermes is a **separate program with its own model
> and its own billing**. Your Anthropic plan does **not** cover it, and there is **no hosted
> Hermes endpoint** — you install and run it on your own machine, then point Xenomoon at it.

## Two keys, one URL (read this first)

| Thing                                 | What it is                                                                                   | Where it comes from                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Provider key** (billable)           | The LLM key that powers Hermes' brain                                                        | You sign up (Nous Portal / OpenRouter / Anthropic) and paste it **inside Hermes** via `hermes setup`. Xenomoon never sees it. |
| **`API_SERVER_KEY`** (not billable)   | A password **you invent** to lock your local gateway                                         | You make it up, put it in `~/.hermes/.env`, and paste the same value into Xenomoon's ⚙ Settings → "Server key".               |
| **Server URL**                        | Your **local** gateway                                                                       | `http://localhost:8642` — exists only while `hermes gateway` is running.                                                      |
| **Web search backend** (free tier OK) | What actually powers `web_search`/`web_extract` — the Portal sign-in does **not** include it | A Firecrawl key (free: 1,000 credits) in the profile's `.env`, or the free `ddgs` package — see "Web research backend" below. |

## Fastest path — one guided command

```bash
npm run hermes:setup
```

Or click **⚙ Settings → Hermes → Set up Hermes**, which runs this same command for you (then
restart the session to activate; you still finish the one-time Nous Portal auth with `hermes portal`).

This installs Hermes if it's missing, turns the local API server on in `~/.hermes/.env`
(generating the `API_SERVER_KEY` for you), **sets the provider and restricts the toolset
directly** via `hermes config set`, installs the Xenomoon "partner" persona into `~/.hermes/SOUL.md`
(only if it's absent or the stock template — a customized SOUL is never overwritten; source:
`ui/server/integrations/hermes/hermes-soul.md`), strips any stale `mcp_servers.xenomoon` callback
left by older Xenomoon versions, echoes what Hermes persisted, and wires Xenomoon's config.
It **never launches an interactive Hermes command** (`hermes setup`/`model`/`tools`) — those
pickers are exactly what trap you. Flags:

```bash
npm run hermes:setup -- --yes                              # no prompts (auto-install)
npm run hermes:setup -- --provider=anthropic --model=anthropic/claude-opus-4.6
npm run hermes:setup -- --toolsets=web,memory       # override the tool allowlist
npm run hermes:setup -- --no-portal                        # don't print the Nous Portal note
npm run hermes:setup -- --reset                            # undo the setup (test the flow from scratch)
```

`--reset` removes Xenomoon's `hermes` block, the `API_SERVER_*` lines from `~/.hermes/.env`,
and the `platform_toolsets.api_server` edit in `config.yaml`. It leaves Hermes itself, your
model/provider and Portal auth untouched — so you can re-run setup on a clean slate.

When no `--model` is given, setup lists the **Nous picker's own recommended models** (read
from the picker's disk cache — same list `hermes model` shows) and lets you choose; Enter
keeps your current model. It warns if a `hermes-*` model is configured: the picker
deliberately does not offer those ("not reliable for agentic tool-calling") and hand-setting
one produces raw unexecuted tool calls in answers.

Defaults: **Nous via Portal**, toolset `web, memory, skills` — research plus Hermes' **own
brain** (`memory` + `skills` self-improvement), and **no machine access** (no
`terminal`/`file`/`code_execution`/`browser`; see "Restrict the toolset" and "Self-improvement"
below for why that one line is the whole guardrail). Two things it leaves to you: the Nous Portal
sign-in (a browser OAuth — run `hermes portal open` with the profile prefix below, _not_ the
wizard) and leaving `hermes gateway` running.

## Per-domain profiles (each domain gets its own brain)

Hermes' brain — SOUL persona, ~2,200-char memory, skills — is global per home dir. Sharing
one `~/.hermes` across the godot upstream and xenomoon domains poisons personas and starves
the memory budget, so setup uses a **native Hermes profile per DOMAIN**
(`~/.hermes/profiles/<domain>`), selected per spawn via `HERMES_HOME` — never the sticky
`hermes profile use` (that would flip the default profile every other tool sees).

- **Profile name** = the baked domain (`webapp`, `expo`, `app`); override with
  `npm run hermes:setup -- --profile=<name>`. Profile `default` = the legacy shared
  `~/.hermes` (godot's home — xenomoon never writes there).
- **Default gateway ports are per-domain** so two profiles never share one gateway (the
  starter reuses any answering gateway): `webapp 8643 · expo 8644 · app 8645` (default
  profile keeps 8642). `--port` overrides.
- **One-time Portal sign-in PER profile.** Manual terminal commands need the profile's env
  prefix, e.g. `HERMES_HOME="$HOME/.hermes/profiles/webapp" hermes portal open` — setup
  prints the exact commands. The UI's "Sign in (browser)" button targets the profile
  automatically.
- Skills/memory compound **within the domain** (every webapp project shares the webapp
  brain), never across domains.

> **Got stuck in `hermes setup` (or `--portal`) before?** Hit **Ctrl+C**. You never need that
> wizard — the script sets every value non-interactively. For Portal auth use `hermes portal`,
> and to pick an exact model use `hermes model`. See "Choosing model & tools" below.

Prefer to do it by hand, or it didn't work? The manual steps are below.

## Step 1 — install & run Hermes (on your machine, one time)

```bash
# Installs python/node/ripgrep + the global `hermes` command
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
# reload your shell

# Pick a model + provider (see "Choosing model & tools" below). For Nous models:
hermes portal open           # one-time Portal sign-in (NOT `hermes setup` — that's the wizard)

# Turn the local API server on — add to ~/.hermes/.env :
#   API_SERVER_ENABLED=true
#   API_SERVER_KEY=pick-any-secret      # you invent this; it's the "Server key" in Xenomoon
#   (API_SERVER_PORT defaults to 8642)

# Run it — serves http://localhost:8642
hermes gateway
```

Leave `hermes gateway` running in its own terminal. Cost is roughly **$0.25–$2.50 per deep run**,
billed by whatever provider you chose.

## Choosing model & tools (no wizard needed)

`npm run hermes:setup` does all of this. To do it by hand: **scalars** go through
`hermes config set`; **lists** (the toolset) must be edited in `config.yaml` directly —
`hermes config set` stores a list as a broken quoted string. Inspect state with
`hermes config show` (note: there is **no** `hermes config get`), or edit with
`hermes config edit`. The file lives at `hermes config path`.

**Model / provider** — scalars, so `config set` works:

```bash
hermes config set model.provider nous     # or: anthropic | openrouter | openai | gemini | custom
hermes config set model.default <model-id>
```

Nous (Portal) models need a one-time browser sign-in — use the dedicated auth command, **not**
the wizard: `hermes portal open` (then `hermes portal status` to confirm). Pick the exact model
with `hermes model` (it only lists models for a provider you're already authed to — that's why
nothing showed before sign-in). Other providers just need their key (`hermes auth add`).

**Restrict the toolset.** ⚠️ Critical: the API server runs as its **own platform, `api_server`**,
and per the gateway's `/v1/capabilities`, **its tools execute on _your machine_** (`tool_execution:
server`, no sandbox). It does **not** read `platform_toolsets.cli` or the top-level `toolsets:` —
it reads **`platform_toolsets.api_server`**, and with no entry there it defaults to **everything on**
(terminal, file, code_execution, browser …). So this is the key that matters for the Xenomoon bridge:

```yaml
platform_toolsets:
  api_server: [web, memory, skills] # research + Hermes' OWN brain (memory + self-evolving
  # skills, written to ~/.hermes — NOT your code); still NO terminal/file/code on your machine
```

`npm run hermes:setup` writes exactly this (default `web, memory, skills`). Widen only if
you knowingly want machine access: `--toolsets=web,memory,skills,terminal,file`. Individual
toolsets: `web, memory, skills, terminal, file, browser, vision, image_gen, todo, tts,
cronjob, moa`. `memory` + `skills` are self-improvement (see below) and stay on your machine inside
`~/.hermes`; `terminal`/`file`/`code_execution`/`browser` are the ones that could touch the game or
this framework, so they stay off.

**Confirm what's actually live** (the only sure check) — `npm run hermes:check` queries the
gateway's `GET /v1/toolsets` and prints the enabled tools, loudly flagging any machine-access ones:

```
API-path tools enabled: web, memory, skills
✓ no machine-access tools (terminal/file/code) on the API path.
```

(`memory` and `skills` are Hermes' own brain, not machine access — the check only flags
`terminal`/`file`/`code_execution`/`browser`.)

Avoid `agent.disabled_toolsets` — a known bug
([#33924](https://github.com/NousResearch/hermes-agent/issues/33924)) can make a bundle name
there silently kill _all_ tools on the gateway path.

## Web research backend (don't skip this — the silent failure mode)

**Enabling the `web` toolset is NOT enough.** The toolset is just the tool _surface_ — actual
search/extract goes through a **backend provider**, and the Nous Portal sign-in does **not**
supply one (Portal covers inference + image gen only). With no backend, everything still
_looks_ fine: the gateway answers, `/v1/toolsets` lists `web`, runs "succeed" — but there is
**no retrieval**, so research comes back as **uncited prose from model memory**, and retries
have been observed **fabricating URLs and quotes**. This exact failure shipped once; hence
the loud guardrails below.

Pick a backend:

| Backend       | Cost                                                                  | Covers                                   | Where the credential goes                         |
| ------------- | --------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| **Firecrawl** | Free tier: **1,000 credits** ([firecrawl.dev](https://firecrawl.dev)) | `web_search` + `web_extract` (best fit)  | `FIRECRAWL_API_KEY=…` in the **profile's** `.env` |
| **Exa**       | Free trial credits ([exa.ai](https://exa.ai))                         | search + contents                        | `EXA_API_KEY=…` in the profile's `.env`           |
| **Parallel**  | Paid ([parallel.ai](https://parallel.ai))                             | search + extract                         | `PARALLEL_API_KEY=…` in the profile's `.env`      |
| **ddgs**      | **Free, no account** (DuckDuckGo python package)                      | `web_search` only — **no `web_extract`** | `pip install ddgs` into Hermes' python; no key    |

Recommended: **Firecrawl free tier** (real extract, 1k credits goes far for research runs)
**plus** ddgs as the no-key floor. `npm run hermes:setup` now handles this: it detects a
usable backend, or asks you to paste a Firecrawl key (`--firecrawl-key=fc-…` non-interactively),
or installs the free ddgs fallback — and writes the key into **this domain's profile** `.env`
(`~/.hermes/profiles/<domain>/.env`), **not** your shell env.

Two rules that come from a real outage:

- **The credential must live in the profile's `.env`.** A key exported only in the shell that
  happened to launch the gateway works until the next restart from a different shell — then
  retrieval dies silently. Files survive restarts; ambient env doesn't.
- **Restart the gateway after adding a key** — `.env` and `config.yaml` are read at startup.

`npm run hermes:check` (and ⚙ Settings → Test connection) now verifies this locally: green
plus `✓ web research backend: firecrawl`, or a loud
`⚠ … NO web search backend is configured …` caveat when the toolset is enabled with nothing
behind it.

## Self-improvement: Hermes' own brain, not your code

Hermes' headline feature is **self-improvement** — after a non-trivial task it writes/updates its
own reusable **skills** (`skill_manage` → `~/.hermes/skills/`) and a background review refreshes its
**memory** (`MEMORY.md`, `USER.md`). We leave both on (`memory` + `skills` in the toolset above) on
purpose: the more Hermes researches for this team, the better it gets at it. You'll see
`🧠 Hermes is updating its own skills/memory` lines in the activity feed when it happens.

**Two separate spheres — this is the whole guardrail.**

- **Hermes' brain** (`~/.hermes/skills`, `~/.hermes/MEMORY.md`) — Hermes grows this freely. It's
  _its_ procedural/episodic memory, not yours.
- **Your project** (the game + this framework) — Hermes **never** touches it. The toolsets that
  could (`terminal`/`file`/`code_execution`/`browser`) stay **off**, so Hermes physically cannot
  edit, build, or write your files. Adopting anything Hermes _found_ into your project is a
  separate, human-gated step: a `xenomoon:*-researcher` writes the verdict + `plugin/library/` entry,
  you approve, and `promote` globalizes it. Hermes self-improving and your codebase changing are
  **different things**, and only the second one is gated by you.

The trade-off we accept: Hermes' brain and our `plugin/library` drift apart over time ("two
brains"). That's fine here — Hermes investigates, humans adopt; nothing Hermes "learns" reaches your
project except through the researcher → library → promote gate.

## Step 2 — point Xenomoon at it

**From the UI (recommended):** `npm start` → ⚙ **Settings** →

1. Expand "First time?" for these same steps.
2. Enable Hermes · URL `http://localhost:8642` · Server key = the `API_SERVER_KEY` you invented.
3. Click **Test connection** — it probes `GET /v1/models` (no model run, no charge) and tells you
   if the gateway is reachable and the key is accepted.
4. **Save.** Takes effect immediately — no server restart.

**From the CLI (equivalent):**

```bash
npm run bind-project-path -- --hermes --hermes-url=http://localhost:8642 --hermes-key=pick-any-secret
npm run hermes:check     # probes the saved config, prints a one-line verdict
npm run bind-project-path -- --hermes-off   # turn it back off
```

## Step 3 — try it

Start a session and give the Hive a **capability / tooling / knowledge-gap** task
(e.g. _"research the best Godot 4 approach for X"_) — optionally naming a persona ("have the
**critic** stress-test …"). When the Hive calls `mcp__ui__hermes`, **approve it in the permission
gate**. It's **fire-and-forget**: the call returns at once and you keep working — Hermes runs in
the background and a watcher streams progress to the feed (the **Hermes** lines, colored per
persona). There is **no callback**: when the run finishes, the watcher **reads** the result from the
runs API (`GET /v1/runs/{id}`) and delivers it as a new message. The Hive then hands those findings
to the matching `xenomoon:*-researcher` → your adopt/reject verdict. If Hermes is off, unreachable,
or the run fails/times out, the Hive just dispatches the researcher itself — same result, no Hermes.

## Can I install Hermes from the UI?

Not fully — and on purpose. Installation is a `curl … | bash`, and choosing a billable provider
(esp. the Nous Portal OAuth) belongs in your terminal, not a web form. The closest to one-click
is the CLI `npm run hermes:setup`, which now sets the model, provider and toolset for you
non-interactively. The UI gives you the copy-paste runbook (⚙ Settings → "First time?") and the
**Test connection** button for instant feedback once the gateway is up.

> **Note on the UI "model" field:** it's a **label only** — it records which model you pointed
> Hermes at, it does **not** change Hermes' actual model. The real model lives in Hermes'
> `config.yaml` (`hermes config set model.default …`, or `npm run hermes:setup`). Changing the
> dropdown alone does nothing on the Hermes side.

## Vendored hermes-agent fix (profile auth brick — upstream #60035)

Upstream hermes-agent has a known, unfixed bug ([NousResearch/hermes-agent#60035](https://github.com/NousResearch/hermes-agent/issues/60035),
its fix PRs closed unmerged): when a profile's `auth.json` is left with a **token-less
`providers.nous` shell** (a terminal refresh failure quarantines the tokens — easy to hit,
since Nous refresh tokens are single-use and any second copy of a credential eventually dies
with `invalid_grant`), the gateway's credential path raises _"No access token found for Nous
Portal login"_ **before** consulting the shared cross-profile store `~/.hermes/shared/nous_auth.json`.
The shell also shadows the root-fallback read, so **no re-login can ever rescue the profile**:
the UI fails every dispatch while the same commands work in a plain terminal, and `hermes` status
prints the contradiction `Auth: not logged in` / `Model: ✓ using Nous`.

We carry the one-function fix as a vendored diff:
`ui/server/integrations/hermes/nous-shared-store-rescue.patch` (consult the shared store before
raising — the same merge-then-check order the non-runtime resolver already uses). Apply it to the
local checkout:

```bash
git -C ~/.hermes/hermes-agent apply <xenomoon>/ui/server/integrations/hermes/nous-shared-store-rescue.patch
# then restart the gateway
```

**A Hermes update reverts it silently.** Both `npm run hermes:check` and the gateway starter
look for the patch's sentinel in the installed source and print a ⚠ with the re-apply command
when it is gone. Never "fix" this by copying `auth.json` between homes — single-use refresh
tokens make every copy a delayed `invalid_grant`; the shared store is the sanctioned mechanism.

## Troubleshooting

- **"No response within 8s — is `hermes gateway` running?"** → the gateway isn't up, or the URL/port
  is wrong. Confirm `hermes gateway` is running and the port matches `API_SERVER_PORT`.
- **UI dispatches fail with "No access token found" but the terminal works** → the profile auth
  brick — see "Vendored hermes-agent fix" above. If the ⚠ says the patch is missing, re-apply it;
  if the profile is already bricked, the patched code self-heals it on the next dispatch (after a
  fresh `hermes portal` login has populated the shared store).
- **"server key was rejected"** → the Xenomoon "Server key" ≠ the `API_SERVER_KEY` in `~/.hermes/.env`.
- **Hive says "Hermes is off or not configured"** → enable it in ⚙ Settings (or `npm run bind-project-path -- --hermes`).
- **Research has no citations / URLs look invented** → the `web` toolset has **no backend behind
  it** — see "Web research backend" above. `npm run hermes:check` prints the ⚠ caveat; fix with
  `npm run hermes:setup` (paste a Firecrawl key or take the ddgs fallback), then **restart the
  gateway**.
- **It works but research isn't better** → that's the real question this POC answers. Compare on a
  real gap task against the native researcher before widening the seam.

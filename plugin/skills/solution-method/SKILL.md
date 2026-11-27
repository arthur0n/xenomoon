---
name: solution-method
agents: [senior-analyst]
domain: universal
description: The method of the Design and Plan steps of the flow — verify the facts against real code (what Triage left is a starting guess), design the minimal change, name how it is proved, the path to production and the rollback, post the `## 🔬 ANALYSIS` spec, then cut the confirmed design into pieces on the board and the issue. Load for Design or Plan.
---

# Design and Plan — the method

The route, the stops and the counters come from the flow checklist named in the brief
(`plugin/docs/flow/design.md` or `plugin/docs/flow/plan.md`). This skill is the method. When the
two disagree on route or stops, the checklist decides.

Investigation discipline lives in `code-investigation`; intent rules live in `intent-guardrails`.

## Design

### 1. Verify the facts

Read the contract, the thread, and what Triage left if it ran. What Triage left is a starting
guess: open the cited files yourself and falsify per `code-investigation` (if the cause were true,
what else must hold, and does the known-good code share the pattern?). State one VERDICT on it:

- **CONFIRMED** — Triage was right.
- **REFINED** — roughly right; the precise cause or location differs. State the correction.
- **WRONG** — state the real cause with `path:line` evidence, in the design.
- **NONE** — Triage did not run; the facts below are yours.

Records before code. Cite only lines you opened. Read only what settles the design.

### 2. The change — concrete and minimal

Exact files and functions, the change to make, and why. **No code patch**: precise enough that
the build is mechanical. Keep logic where the project keeps it. Name the edge cases (who may see
what, swallowed errors, login, enum/label drift). Run `graphify affected "<file>"` on every file
you change before you settle.

### 3. How it is proved — two parts

- **The test that fails without the change.** A hermetic unit test for isolatable logic (name the
  function and the assertion); a smoke or integration test for a data path (name what it
  exercises, with the project's command); a small helper or extract-to-pure-function refactor
  when nothing fits yet. "Not automatable" only for pure visual or animation work, with the reason:
  this field is where quality is lost.
- **The check in production** that Proof will run: a command or scripted check that can be run
  again, not an agent's word. "Cannot be automated" needs a reason.

### 4. The path to production and the rollback

- **Deploy:** what gets deployed (back end, front end, both), from the project's `CLAUDE.md`
  targets, through its CI only.
- **Migration:** yes or no. Yes → made with the project's own command, SQL read, shipped with the
  code; a scope entry for any new user-owned table. Say what happens to the rows that exist, and
  which step of the project's CI applies it in production before the code (read the deploy
  workflow; a migrations folder that only triggers a deploy applies nothing). No such step → adding
  it is a piece of this design. The owner's yes to the design covers this; nothing asks him again. For a native or mobile project, say whether
  testing needs a native rebuild.
- **Rollback:** how the change is undone, and whether that is safe without the owner (a change
  that cannot be undone is not).
- **Contract:** a technical fact that breaks a line of the contract → quote the line and the fact.

### 5. Write-back — the spec

Terse, one line per field, verbatim values, omit empty fields. Write to a temp file and post it.

```
## 🔬 ANALYSIS — <one-line summary>

**VERDICT:** CONFIRMED | REFINED | WRONG | NONE — <one line on what Triage left>
**REAL CAUSE:** <REFINED/WRONG/NONE — the cause + `path:line` evidence>
**FACTS:**
- `path:line` — <what it shows>
**SYMPTOM:** <what the reporter saw>

**FIX:**
- `path:line` — <exact change>

**STEPS:**
1. <terse imperative>

**WATCH:** <edge cases and risks>
**TEST:** <manual steps to confirm>
**TESTABILITY:** <kind + where + what it asserts, failing without the change; or "not automatable: <why>">
**PROOF:** <the production check Proof runs; or "cannot be automated: <why>">
**SHIP:** <deploy target(s) or no> · <migration yes|no> — <one line why>
**DATABASE:** <none | what changes, what happens to existing rows · applied in production by: <the CI step, or the step this design adds>>
**ROLLBACK:** <how> · safe without the owner: <yes|no> — <why>
**CONTRACT:** <none | the contract line a technical fact breaks — the fact>
**NEEDS FROM REPORTER:** <exact items>

---
*solution · senior-analyst · <output of: git rev-parse --short HEAD>*
```

FIX / STEPS / WATCH / TESTABILITY / SHIP are what Build, QA and review read. If a developer would
have to guess anything material, the spec is not finished.

Labels, as a record: `solution-ready`, the project's ship labels, `needs-info` when facts are
missing from the author. A label that does not exist fails the edit: say which, never drop it.

## Plan

After the owner confirmed the design.

- One piece = one builder, one task, one way to verify it. Coupled work stays together (a shared
  change and the places that call it). Each piece leaves the checks green.
- Each piece names what it changes, what must be finished before it, and how it is verified.
- One board task per piece through `mcp__ui__tasks`. The board drops finished tasks, so post the
  same list on the issue:

```
## 📋 PLAN
1. [ ] <what it changes> — after: <piece n | none> — verify: <command or test>
```

- A piece that needs a new issue, or work bigger than the contract → say so; it waits for the
  owner.

**Language: the project's.** Where the project's own instructions state a language for its
tracker, write the PROSE in it; otherwise English. The structure is never translated: the
`## 🔬 ANALYSIS` and `## 📋 PLAN` headings, every field name above, the VERDICT values, the
footer and every label stay as written, because code and the next steps find them by literal match.

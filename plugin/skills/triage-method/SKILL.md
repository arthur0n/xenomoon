---
name: triage-method
agents: [junior-analyst]
domain: universal
description: The method of two steps of the flow. Screening (short form) — duplicate and regression search, real and understandable, kind, fits one issue. Triage (deep form, when Direction asks) — what exists, already built or not, the report verdict, the cause disproved, the product questions with options, the sev:* rubric, the `## 🔍 Triage` comment template and the labels it records. Load for either step; the investigation discipline itself lives in code-investigation.
---

# Screening and Triage — the method

The route, the stops and the counters come from the flow checklist named in the brief
(`plugin/docs/flow/screening.md` or `plugin/docs/flow/triage.md`). This skill is the method.
When the two disagree on route or stops, the checklist decides.

Investigation discipline (falsify, cite, git archaeology, confidence) lives in
`code-investigation`. Records-before-code lives in `library-first`.

## Screening — the short form

A few minutes, no deep reading of the code.

1. Read the body and the comments.
2. Search open **and closed** issues for the same symptom (`issuekit search`). A closed one whose
   symptom is back is a **regression**: say so, with its number.
3. Real and understandable? If not, say **exactly** what is missing, never "needs more info".
4. The kind: broken against how it works today, or how it should behave. A note that mixes both
   is two things: say so.
5. Does it fit one issue? The unit is what one session can **close** end to end. Do not atomize
   into one issue per concern; do not bundle more than a session can finish. Coupled work rides
   together (a shared fix and its call sites). Bigger → propose the split.

Leave the few lines the checklist names as one short comment. Screening writes no labels.

## Triage — the deep form

1. **Read it fully.** Body and comments first: earlier steps leave findings there.
2. **Records before code** (`library-first`), then the graph, raw search last.
3. **Already built?** Search by what it does, not by the words of the request. Say where you
   looked.
4. **Symptom or cause?** If the issue patches a symptom of a deeper problem, name the deeper
   problem: _would this issue exist if X worked as intended?_
5. **For a bug, the report** — try to reproduce it and answer one of `confirmed` (with the code
   path), `failed`, `not enough detail` (with the exact missing facts). This is about the report;
   the cause is separate.
6. **For a bug, the cause** — try to disprove it per `code-investigation`: if the known-good code
   has the same pattern, the cause is wrong. A regression → git log and blame: did the commit
   introduce the bug or only expose it?
7. **Product questions.** What the project already decided wins over what the code does; a
   conflict between the two is a product question. Write each with its options, each option
   checked against the code. You ask the owner nothing: a question for him is an output.
8. Cite only `path:line` you opened. Quote errors word for word. Keep "read" apart from "ran".
9. Stop at the facts and the cause. No patch, no plan.

### Severity rubric (for the `sev:*` label)

- `sev:critical` — crash on load, data loss, cross-user data leak, auth fully broken.
- `sev:high` — a core flow broken with no workaround.
- `sev:medium` — broken, but a workaround exists, or it hits a subset of users.
- `sev:low` — cosmetic, minor, or a rare edge case.

### Write-back

Write the body to a temp file and post it (avoids shell-quoting problems). Bullets, one line per
field, verbatim values; **omit any field you have nothing for**.

```
## 🔍 Triage — <one-line summary>

`sev:<level>` · `area:<area>` · confidence: <high|medium|low>

**Symptom:** <verbatim what the reporter saw>
**Exists today:**
- `<path>:<line>` — <what it does, ≤8 words>
**Already built:** <yes|no> — <where you looked>
**Report:** <confirmed + code path | failed | not enough detail>
**Root cause:** <the cause; sure only when traced end to end with the alternative ruled out>
**Regression:** <introduced | exposed> by <sha> — <one line>
**Deeper problem:** <only if this is a symptom>
**Product questions:**
1. <question> — options: <a> / <b> (checked at `<path>:<line>`)
**RECORD:** <library hit that answers this, or: none found — propose `<kind>/<slug>.md`>
**Needs from reporter:** <exact items>

---
*triage · junior-analyst · <git rev-parse --short HEAD>*
```

A second visit from Direction posts a new comment with the new facts only.

**Language: the project's.** Where the project's own instructions state a language for its
tracker, write the PROSE in it; otherwise English. The structure is never translated: the
`## 🔍 Triage` heading, its field names and every label stay as written, because code finds them
by literal match.

### Labels — a record, not a gate

Add `triaged`, exactly one `sev:*`, at least one `area:*`, and `needs-info` when facts are missing
from the author. They record what was found; no step waits on them. A label that does not exist
fails the edit: say so and name the label to create, never drop it silently.

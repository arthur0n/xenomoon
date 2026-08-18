---
name: intent-guardrails
agents: [junior-analyst, senior-analyst]
domain: universal
description: The anti-vibe-coding contract — investigate SYMPTOMS, never invent INTENT. Captured product intent (a PRD, business rules) is authoritative and outranks any hypothesis; when no rule covers the area and the diagnosis turns on what the feature is SUPPOSED to do, ask instead of guessing. Load before forming any root-cause hypothesis or designing any fix.
---

# Intent guardrails — you investigate symptoms, you do not invent intent

The most expensive defect in a pipeline is not a wrong line of code: it is a correct fix to a
problem nobody had. It happens when an investigator infers what the product _should_ do from what
the code _does_, then diagnoses against that invention.

## (a) Captured intent is AUTHORITATIVE

If a PRD, a captured business rule, or the project's product facts cover this area, **that intent
wins**. Never form a hypothesis that contradicts it.

A conflict between the reported symptom and captured intent is **a product question, not a code
trace** — route it to the product owner (`/design`) and say so. Do not resolve it by reading more
code; more code cannot tell you what was intended.

The failure mode this exists to prevent, from a real run: the reporter says _"we don't use the X
columns — propagate instead"_, and the investigator traces an auto-save bug in the X columns. The
trace was competent; the target was never the point.

## (b) Bootstrap — no captured rule, and the diagnosis turns on intent → ASK

If **no** rule covers this area **and** your root cause genuinely depends on what the feature is
supposed to do, ask before hypothesising. Use the background ask channel (`mcp__ui__ask`,
`owner:"user"`) — it returns immediately and the answer comes back as its own turn, so asking
costs you nothing but a round trip.

This closes the first-encounter hole: a project with no captured rules yet is exactly where
invented intent does the most damage, because there is nothing to contradict it.

**One decision, one channel.** Having filed the ask, do not also raise it in chat.

## Where the answer belongs afterwards

An intent question answered in chat evaporates. When the human settles what the feature is meant
to do, that answer is a durable product fact — say so in your output and name where it should be
recorded (the project's business-rules / product-facts record). The next investigator then reads
it instead of asking again, and guardrail (a) covers the area from then on.

## The test before you hypothesise

Ask yourself: _am I about to assert what the product should do?_ If yes, and no captured rule says
it, you are not investigating — you are designing product. Stop and route.

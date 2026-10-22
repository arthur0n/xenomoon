---
name: adversarial-review-security-diffs
kind: verdicts
description: Every diff touching authentication, authorization, sessions, HTML rendering or an HTTP boundary gets an independent read-only reviewer before commit, driven by a five-part attack prompt; every finding is folded or rejected with a written reason.
status: accepted
tags: [convention, security, review]
date: 2026-09-04
---

# Adversarial review of every security-relevant diff

## Decision

- Scope: any diff touching authentication, authorization, session handling, HTML rendering or an HTTP boundary.
- Reviewer: a second model run as a CLI in a **read-only sandbox** — the builder writes, the reviewer judges; a
  reviewer that can fix is not independent. Not an interactive, editing task.
- CLI hygiene: close stdin (`< /dev/null`) so it cannot hang, and write only the final message to a file so a long
  finding list is not truncated.
- The prompt is the control. Five parts: (1) exactly what changed, (2) what the system is, (3) a numbered hunt list
  written as attacks to attempt, (4) the tests you least trust, named, (5) "concrete findings only, each with exact
  input and consequence; one line per clean category; no style comments".
- Every finding is folded or escalated with a reason, never explained away and never folded by the reviewer. A
  rejected finding is written down where accepted risks live, so it reads as a decision.

## Why

"Review the ACL code" produces prose; "any way past the ACL gate" produces findings.

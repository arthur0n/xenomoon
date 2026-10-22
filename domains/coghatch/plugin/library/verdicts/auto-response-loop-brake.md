---
name: auto-response-loop-brake
kind: verdicts
description: An automatic response is never answered, an address never answers itself, and every outbound mail declares itself automatic; the inbound refusal ends the run as completed before any step, so no alert mail is sent.
status: accepted
amends:
  [
    inbound-routing-by-address-in-pipeline,
    agent-per-email-address,
    one-message-one-run-agent-owns-thread,
  ]
tags: [email, security]
date: 2026-09-16
source: platform D26
---

# Mail loop brake

## Context

An out-of-office auto-reply answered a pipeline's question mail and triggered a second run, which mailed
again. The agent had classified it as not an order, and the mail went out anyway.

## Decision

(1) The inbound event carries six loop-relevant headers raw, folding whitespace collapsed: `Auto-Submitted`,
`X-Auto-Response-Suppress`, `Precedence`, `List-Id`, `In-Reply-To`, `References`; the receiver decides nothing.
(2) One shared rule, applied by every email-triggered function before its first step, ends the run as a
completed run with a reason when: Auto-Submitted is present and not `no`; suppress is present and not `None`;
precedence is bulk, junk, list or auto_reply; List-Id is present; or the sender canonically equals the
pipeline's own address. It is a result, not a throw, because a throw would trigger the failure mail.
(3) Every outbound mail sends `Auto-Submitted: auto-replied`, `X-Auto-Response-Suppress: All`, and threading
headers. Deploy order: receiver first, app second.

## Why

- The agent's judgement is not a brake. A per-sender rate cap was not built: its number would be invented, and
  rate-limited events are dropped, not queued.

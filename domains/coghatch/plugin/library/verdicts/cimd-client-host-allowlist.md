---
type: verdicts
title: Only allowlisted client hosts may connect
description: The access hub accepts a Client ID Metadata Document only from a configured list of client hosts, so an attacker URL cannot become an MCP client and the consent page shows only our own names.
status: stable
tags: [oauth, mcp, security]
source: hub M10
generated: { by: human:migrate, at: 2026-09-03T00:00:00Z }
---

The access hub accepts a Client ID Metadata Document only from a configured list of client hosts, so an attacker URL cannot become an MCP client and the consent page shows only our own names.

## Why

- "Zero admin steps" was a UX requirement, not a security property; an allowlist costs nothing per user
  or per connection, so the UX is unchanged.
- The consent page renders our own display name for each allowed host and never renders

## Context

CIMD documents are accepted only from a configured list of hosts (ChatGPT at the start). Adding a vendor is
a one-line config change, reviewed in git and deployed by CI. The identity provider's admins are not
involved.

With CIMD, any web-hosted document can identify a client. Without a limit, any attacker-controlled
URL becomes a registered MCP client, and the consent screen is the only barrier between a phished
employee and their agents.
attacker-supplied text.

- Remembered consent (`oauth-consent-no-expiry`) depends on this list: client identity must be assured.
  Anyone widening the list must revisit that decision first.

---
name: machine-auth-entra-workload-federation
kind: verdicts
description: Machine callers present a Microsoft Entra app-only token to the agent harness, obtained by workload identity federation from the VM's Google identity, so no client secret, certificate or key file is stored.
status: accepted
amends: [agent-sdk-adapter-only]
tags: [auth, oauth, security, secrets, agent-forge]
date: 2026-10-04
source: platform D35
---

# Entra app-only tokens via workload identity federation

## Context

Pipelines and the MCP tools server call the agent harness, which was moving from no auth to identity-provider
login. Both run on the VM under one Google service account.

## Decision

One Entra app for both callers (a second app would trust the same Google identity and separate nothing); its
service principal holds the harness's machine app role by admin-consented assignment. A federated identity
credential trusts the VM service account: issuer `https://accounts.google.com`, subject the account's unique
id, audience `api://AzureADTokenExchange`. The caller mints a Google ID token for that audience and exchanges
it with `client_credentials` and a JWT-bearer client assertion; the exchange and cache live in the connections
package, which takes the assertion as a callback (no Google dependency). The token rides only the SDK's bearer
supplier, never signed-URL downloads. A 401 forces one refresh and one replay; nothing else is replayed. Only
header-safe tokens are handed out. Session metadata is `{ source: "pipeline" }`; the user is the verified
subject. Tenant, client id and scope are config, not secrets.

## Why

- Rejected: a client secret or certificate (a stored credential to rotate); MSAL or `openid-client` (one POST and a cache).
- Re-open if callers get separate Google identities or a caller off the VM needs a token.
